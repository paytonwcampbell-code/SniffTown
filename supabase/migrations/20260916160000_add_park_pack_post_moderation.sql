-- Park boards are private to members. Reports are similarly private: reporters
-- cannot enumerate one another and only the pack creator or an explicitly
-- designated moderator can review them.

alter table public.pack_posts
  add column if not exists moderation_status text not null default 'visible';

alter table public.pack_posts
  drop constraint if exists pack_posts_moderation_status_check;

alter table public.pack_posts
  add constraint pack_posts_moderation_status_check
  check (moderation_status in ('visible', 'hidden'));

create table if not exists public.pack_moderators (
  pack_id uuid not null references public.packs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (pack_id, user_id)
);

alter table public.pack_moderators enable row level security;

drop policy if exists "Pack creators manage moderators" on public.pack_moderators;
create policy "Pack creators manage moderators"
  on public.pack_moderators
  for all
  to authenticated
  using (public.is_pack_creator(pack_id, auth.uid()))
  with check (public.is_pack_creator(pack_id, auth.uid()));

create or replace function public.is_pack_moderator(
  target_pack_id uuid,
  actor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select actor_id is not null and (
    exists (
      select 1
      from public.packs p
      where p.id = target_pack_id
        and p.creator_id = actor_id
    )
    or (
      exists (
        select 1
        from public.pack_moderators pm
        where pm.pack_id = target_pack_id
          and pm.user_id = actor_id
      )
      and exists (
        select 1
        from public.pack_members member
        where member.pack_id = target_pack_id
          and member.user_id = actor_id
      )
    )
  );
$function$;

create table if not exists public.pack_post_reports (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.packs(id) on delete cascade,
  post_id uuid not null references public.pack_posts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open',
  created_at timestamp with time zone not null default now(),
  moderated_at timestamp with time zone,
  moderated_by uuid references auth.users(id) on delete set null,
  constraint pack_post_reports_reason_check
    check (reason in ('spam', 'harassment', 'unsafe', 'other')),
  constraint pack_post_reports_details_length_check
    check (details is null or char_length(details) <= 500),
  constraint pack_post_reports_status_check
    check (status in ('open', 'dismissed', 'actioned')),
  constraint pack_post_reports_post_reporter_key unique (post_id, reporter_id)
);

create index if not exists pack_post_reports_open_pack_created_idx
  on public.pack_post_reports (pack_id, created_at desc)
  where status = 'open';

create index if not exists pack_post_reports_reporter_created_idx
  on public.pack_post_reports (reporter_id, created_at desc);

alter table public.pack_post_reports enable row level security;

-- Reporting and moderation happen only through the narrowly scoped RPCs below.
-- In particular, a member cannot read report rows or discover the reporter.

create or replace function public.report_pack_post(
  target_pack_id uuid,
  target_post_id uuid,
  report_reason text,
  report_details text default null
)
returns table(report_id uuid, status text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  post_author_id uuid;
  inserted_report_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Sign in to report a park-pack post.';
  end if;

  if not public.user_can_access_pack(target_pack_id, actor_id) then
    raise exception using errcode = '42501', message = 'Join this park pack before reporting posts.';
  end if;

  select pp.author_id
    into post_author_id
  from public.pack_posts pp
  where pp.id = target_post_id
    and pp.pack_id = target_pack_id
    and pp.moderation_status = 'visible';

  if not found then
    raise exception using errcode = 'P0002', message = 'Park-pack post not found.';
  end if;

  if post_author_id = actor_id then
    raise exception using errcode = '22023', message = 'You cannot report your own park-pack post.';
  end if;

  if report_reason not in ('spam', 'harassment', 'unsafe', 'other') then
    raise exception using errcode = '22023', message = 'Choose a valid report reason.';
  end if;

  if report_details is not null and char_length(btrim(report_details)) > 500 then
    raise exception using errcode = '22023', message = 'Keep report details under 500 characters.';
  end if;

  -- Serialize the rolling-limit check per reporter so simultaneous requests
  -- cannot race past the five-report allowance.
  perform pg_advisory_xact_lock(hashtext(actor_id::text));

  if (
    select count(*)
    from public.pack_post_reports r
    where r.reporter_id = actor_id
      and r.created_at > clock_timestamp() - interval '1 hour'
  ) >= 5 then
    raise exception using errcode = 'P0001', message = 'Report rate limit reached. Try again in an hour.';
  end if;

  insert into public.pack_post_reports (
    pack_id,
    post_id,
    reporter_id,
    reason,
    details
  )
  values (
    target_pack_id,
    target_post_id,
    actor_id,
    report_reason,
    nullif(btrim(report_details), '')
  )
  on conflict (post_id, reporter_id) do nothing
  returning id into inserted_report_id;

  if inserted_report_id is null then
    raise exception using errcode = '23505', message = 'You have already reported this post.';
  end if;

  return query select inserted_report_id, 'open'::text;
end;
$function$;

create or replace function public.get_pack_post_reports_for_moderation(
  target_pack_id uuid
)
returns table(
  id uuid,
  post_id uuid,
  post_content text,
  author_display_name text,
  reason text,
  details text,
  created_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_pack_moderator(target_pack_id, auth.uid()) then
    raise exception using errcode = '42501', message = 'Only park-pack moderators can review reports.';
  end if;

  return query
  select
    r.id,
    r.post_id,
    pp.content,
    case
      when coalesce(up.name_display, 'initial') = 'full' then p.full_name
      when coalesce(up.name_display, 'initial') = 'initial' then
        case
          when p.full_name is not null then
            split_part(p.full_name, ' ', 1) || ' ' ||
            coalesce(left(split_part(p.full_name, ' ', 2), 1) || '.', '')
          else 'Pack Member'
        end
      else 'Pack Member'
    end as author_display_name,
    r.reason,
    r.details,
    r.created_at
  from public.pack_post_reports r
  join public.pack_posts pp on pp.id = r.post_id
  left join public.profiles p on p.id = pp.author_id
  left join public.user_privacy up on up.user_id = pp.author_id
  where r.pack_id = target_pack_id
    and r.status = 'open'
  order by r.created_at asc
  limit 50;
end;
$function$;

create or replace function public.moderate_pack_post_report(
  target_pack_id uuid,
  target_report_id uuid,
  moderation_action text
)
returns table(report_id uuid, post_id uuid, status text, action text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  target_post_id uuid;
  resulting_status text;
begin
  if not public.is_pack_moderator(target_pack_id, actor_id) then
    raise exception using errcode = '42501', message = 'Only park-pack moderators can moderate reports.';
  end if;

  if moderation_action not in ('hide', 'dismiss') then
    raise exception using errcode = '22023', message = 'Choose hide or dismiss.';
  end if;

  select r.post_id
    into target_post_id
  from public.pack_post_reports r
  where r.id = target_report_id
    and r.pack_id = target_pack_id
    and r.status = 'open'
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Open report not found.';
  end if;

  if moderation_action = 'hide' then
    update public.pack_posts
    set moderation_status = 'hidden',
        updated_at = now()
    where id = target_post_id
      and pack_id = target_pack_id;

    update public.pack_post_reports
    set status = 'actioned',
        moderated_at = now(),
        moderated_by = actor_id
    where post_id = target_post_id
      and status = 'open';

    resulting_status := 'actioned';
  else
    update public.pack_post_reports
    set status = 'dismissed',
        moderated_at = now(),
        moderated_by = actor_id
    where id = target_report_id;

    resulting_status := 'dismissed';
  end if;

  return query select target_report_id, target_post_id, resulting_status, moderation_action;
end;
$function$;

-- RLS policies authorize rows, not individual columns. Existing post policies
-- may therefore allow an author to submit moderation_status on an otherwise
-- legitimate insert or update. Use a SECURITY INVOKER trigger so direct API
-- writes run as `authenticated`, while the narrowly scoped SECURITY DEFINER
-- moderation RPC runs as its owner.
--
-- Do not use a transaction/session setting as the RPC marker: a client can set
-- arbitrary settings through SQL. Instead, derive the trusted definer role
-- from the moderation RPC itself. This deliberately does not assume that a
-- Supabase project uses `postgres` as its migration/function owner.
create or replace function public.guard_pack_post_moderation_write()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog'
as $function$
declare
  moderation_rpc_owner name;
begin
  -- Reports are permanently associated with the pack in which the post was
  -- reported. Letting an author move a post would let them evade that pack's
  -- moderation queue (and could leave pack_id values inconsistent).
  if tg_op = 'UPDATE'
     and new.pack_id is distinct from old.pack_id then
    raise exception using
      errcode = '42501',
      message = 'Park-pack posts cannot be moved between packs.';
  end if;

  if (
    tg_op = 'INSERT'
    and new.moderation_status <> 'visible'
  ) or (
    tg_op = 'UPDATE'
    and new.moderation_status is distinct from old.moderation_status
  ) then
    select pg_get_userbyid(p.proowner)
      into moderation_rpc_owner
    from pg_proc p
    where p.oid = to_regprocedure(
      'public.moderate_pack_post_report(uuid,uuid,text)'
    );

    if moderation_rpc_owner is null
       or current_user <> moderation_rpc_owner then
      raise exception using
        errcode = '42501',
        message = 'Only the park-pack moderation workflow can change a post moderation status.';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists guard_pack_post_moderation_write on public.pack_posts;
create trigger guard_pack_post_moderation_write
  before insert or update on public.pack_posts
  for each row
  execute function public.guard_pack_post_moderation_write();

-- Hidden posts must not be exposed by direct table access either. Moderation
-- RPCs use SECURITY DEFINER and remain limited to moderators.
drop policy if exists "Pack members can view posts" on public.pack_posts;
create policy "Pack members can view visible posts"
  on public.pack_posts
  for select
  to public
  using (
    moderation_status = 'visible'
    and public.user_can_access_pack(pack_id, auth.uid())
  );

create or replace function public.get_pack_posts_with_authors(target_pack_id uuid)
returns table(
  id uuid,
  pack_id uuid,
  author_id uuid,
  title text,
  content text,
  post_type text,
  image_url text,
  is_pinned boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  author_display_name text,
  author_avatar_url text,
  dog_name text,
  dog_photo_url text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.user_can_access_pack(target_pack_id, auth.uid()) then
    return;
  end if;

  return query
  select
    pp.id,
    pp.pack_id,
    pp.author_id,
    pp.title,
    pp.content,
    pp.post_type,
    pp.image_url,
    pp.is_pinned,
    pp.created_at,
    pp.updated_at,
    case
      when coalesce(up.name_display, 'initial') = 'full' then p.full_name
      when coalesce(up.name_display, 'initial') = 'initial' then
        case
          when p.full_name is not null then
            split_part(p.full_name, ' ', 1) || ' ' ||
            coalesce(left(split_part(p.full_name, ' ', 2), 1) || '.', '')
          else 'Pack Member'
        end
      else 'Pack Member'
    end as author_display_name,
    p.avatar_url as author_avatar_url,
    d.name as dog_name,
    d.photo_url as dog_photo_url
  from public.pack_posts pp
  left join public.profiles p on p.id = pp.author_id
  left join public.user_privacy up on up.user_id = pp.author_id
  left join lateral (
    select dogs.name, dogs.photo_url
    from public.dogs
    where dogs.user_id = pp.author_id
    order by dogs.updated_at desc
    limit 1
  ) d on true
  where pp.pack_id = target_pack_id
    and pp.moderation_status = 'visible'
  order by pp.is_pinned desc, pp.created_at desc;
end;
$function$;

revoke all on function public.is_pack_moderator(uuid, uuid) from public;
revoke all on function public.report_pack_post(uuid, uuid, text, text) from public;
revoke all on function public.get_pack_post_reports_for_moderation(uuid) from public;
revoke all on function public.moderate_pack_post_report(uuid, uuid, text) from public;
revoke all on function public.guard_pack_post_moderation_write() from public;
grant execute on function public.report_pack_post(uuid, uuid, text, text) to authenticated;
grant execute on function public.get_pack_post_reports_for_moderation(uuid) to authenticated;
grant execute on function public.moderate_pack_post_report(uuid, uuid, text) to authenticated;