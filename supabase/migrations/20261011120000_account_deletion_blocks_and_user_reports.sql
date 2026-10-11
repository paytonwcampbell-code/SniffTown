-- App Store / Google Play requirements:
--   * Members can delete their own account (and its data) from inside the app.
--   * Members can block another member, which stops messages in both
--     directions.
--   * Members can report another member; reports land in a private queue that
--     only the service role (Supabase dashboard) can read.

-- ---------------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------------

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self_check check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx
  on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

revoke all on public.user_blocks from anon;
grant select, insert, delete on public.user_blocks to authenticated;

-- A member sees and manages only the blocks they created. Nobody can discover
-- who has blocked them.
drop policy if exists "Members read their own blocks" on public.user_blocks;
create policy "Members read their own blocks"
  on public.user_blocks
  for select
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "Members create their own blocks" on public.user_blocks;
create policy "Members create their own blocks"
  on public.user_blocks
  for insert
  to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "Members remove their own blocks" on public.user_blocks;
create policy "Members remove their own blocks"
  on public.user_blocks
  for delete
  to authenticated
  using (blocker_id = auth.uid());

-- True when the current member and other_user_id have blocked each other in
-- either direction. Scoped to auth.uid() so it cannot be used to probe blocks
-- between two other members.
create or replace function public.is_blocked_with(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = other_user_id)
       or (b.blocker_id = other_user_id and b.blocked_id = auth.uid())
  );
$function$;

revoke all on function public.is_blocked_with(uuid) from public, anon;
grant execute on function public.is_blocked_with(uuid) to authenticated;

-- Restrictive policies are ANDed with the existing permissive ones, so these
-- only ever narrow what members could already do.
drop policy if exists "Blocked members cannot message each other"
  on public.messages;
create policy "Blocked members cannot message each other"
  on public.messages
  as restrictive
  for insert
  to authenticated
  with check (not public.is_blocked_with(receiver_id));

drop policy if exists "Blocked members cannot start conversations"
  on public.conversations;
create policy "Blocked members cannot start conversations"
  on public.conversations
  as restrictive
  for insert
  to authenticated
  with check (
    not public.is_blocked_with(
      case
        when participant_1_id = auth.uid() then participant_2_id
        else participant_1_id
      end
    )
  );

-- ---------------------------------------------------------------------------
-- Member reports
-- ---------------------------------------------------------------------------

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  context text not null,
  reason text not null,
  details text,
  status text not null default 'open',
  created_at timestamp with time zone not null default now(),
  constraint user_reports_context_check
    check (context in ('conversation', 'dog_profile')),
  constraint user_reports_reason_check
    check (reason in ('spam', 'harassment', 'unsafe', 'inappropriate', 'other')),
  constraint user_reports_details_length_check
    check (details is null or char_length(details) <= 500),
  constraint user_reports_status_check
    check (status in ('open', 'dismissed', 'actioned')),
  constraint user_reports_not_self_check
    check (reporter_id <> reported_user_id)
);

create index if not exists user_reports_open_created_idx
  on public.user_reports (created_at desc)
  where status = 'open';

create index if not exists user_reports_reporter_created_idx
  on public.user_reports (reporter_id, created_at desc);

-- No policies: members can only file reports through report_user(), and only
-- the service role (Supabase dashboard) can read the queue.
alter table public.user_reports enable row level security;

revoke all on public.user_reports from anon, authenticated;

create or replace function public.report_user(
  target_user_id uuid,
  report_context text,
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
  trimmed_details text := nullif(btrim(coalesce(report_details, '')), '');
  inserted_report_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Sign in to report a member.';
  end if;

  if target_user_id is null or target_user_id = actor_id then
    raise exception using errcode = '22023', message = 'You cannot report yourself.';
  end if;

  if not exists (select 1 from auth.users u where u.id = target_user_id) then
    raise exception using errcode = 'P0002', message = 'That member is no longer on SniffTown.';
  end if;

  if report_context not in ('conversation', 'dog_profile') then
    raise exception using errcode = '22023', message = 'Choose where this happened.';
  end if;

  if report_reason not in ('spam', 'harassment', 'unsafe', 'inappropriate', 'other') then
    raise exception using errcode = '22023', message = 'Choose a valid report reason.';
  end if;

  if trimmed_details is not null and char_length(trimmed_details) > 500 then
    raise exception using errcode = '22023', message = 'Keep report details under 500 characters.';
  end if;

  -- Serialize per reporter so simultaneous requests cannot race past the limit.
  perform pg_advisory_xact_lock(hashtext('user_reports:' || actor_id::text));

  if (
    select count(*)
    from public.user_reports r
    where r.reporter_id = actor_id
      and r.created_at > now() - interval '1 day'
  ) >= 10 then
    raise exception using errcode = '54000', message = 'You have sent several reports today. Our team is reviewing them.';
  end if;

  insert into public.user_reports (
    reporter_id, reported_user_id, context, reason, details
  )
  values (
    actor_id, target_user_id, report_context, report_reason, trimmed_details
  )
  returning id into inserted_report_id;

  return query select inserted_report_id, 'open'::text;
end;
$function$;

revoke all on function public.report_user(uuid, text, text, text) from public, anon;
grant execute on function public.report_user(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------------

-- Deletes a row set only when the table and column exist, so this function
-- keeps working if an older Lovable table is renamed or removed.
create or replace function private.delete_rows_if_present(
  target_table text,
  target_column text,
  target_value uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = target_table
      and column_name = target_column
  ) then
    execute format('delete from public.%I where %I = $1', target_table, target_column)
      using target_value;
  end if;
end;
$function$;

revoke all on function private.delete_rows_if_present(text, text, uuid) from public, anon, authenticated;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  owned_pack record;
  successor_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'Sign in to delete your account.';
  end if;

  -- Park packs are shared spaces. Hand each pack this member created to a
  -- remaining moderator (or, failing that, another member) so the community
  -- survives. Packs with nobody else in them are removed.
  for owned_pack in
    select p.id from public.packs p where p.creator_id = actor_id
  loop
    select pm.user_id
      into successor_id
    from public.pack_members pm
    left join public.pack_moderators moderator
      on moderator.pack_id = pm.pack_id
     and moderator.user_id = pm.user_id
    where pm.pack_id = owned_pack.id
      and pm.user_id <> actor_id
    order by (moderator.user_id is null), pm.user_id
    limit 1;

    if successor_id is null then
      perform private.delete_rows_if_present('pack_posts', 'pack_id', owned_pack.id);
      perform private.delete_rows_if_present('pack_requests', 'pack_id', owned_pack.id);
      perform private.delete_rows_if_present('pack_members', 'pack_id', owned_pack.id);
      delete from public.packs where id = owned_pack.id;
    else
      delete from public.pack_moderators
      where pack_id = owned_pack.id and user_id = successor_id;
      update public.packs set creator_id = successor_id where id = owned_pack.id;
    end if;
  end loop;

  -- Rows that point at this member's dogs from other members' data.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dog_familiars' and column_name = 'marked_dog_id'
  ) then
    execute 'delete from public.dog_familiars where marked_dog_id in (select id from public.dogs where user_id = $1)'
      using actor_id;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pack_requests' and column_name = 'to_dog_id'
  ) then
    execute 'delete from public.pack_requests where to_dog_id in (select id from public.dogs where user_id = $1)'
      using actor_id;
  end if;

  -- Everything the member authored or is a party to.
  perform private.delete_rows_if_present('messages', 'sender_id', actor_id);
  perform private.delete_rows_if_present('messages', 'receiver_id', actor_id);
  perform private.delete_rows_if_present('conversations', 'participant_1_id', actor_id);
  perform private.delete_rows_if_present('conversations', 'participant_2_id', actor_id);
  perform private.delete_rows_if_present('dog_familiars', 'user_id', actor_id);
  perform private.delete_rows_if_present('pack_requests', 'from_user_id', actor_id);
  perform private.delete_rows_if_present('pack_requests', 'to_user_id', actor_id);
  perform private.delete_rows_if_present('pack_post_reports', 'reporter_id', actor_id);
  perform private.delete_rows_if_present('pack_posts', 'author_id', actor_id);
  perform private.delete_rows_if_present('pack_moderators', 'user_id', actor_id);
  perform private.delete_rows_if_present('pack_members', 'user_id', actor_id);
  perform private.delete_rows_if_present('notifications', 'recipient_id', actor_id);
  perform private.delete_rows_if_present('dogs', 'user_id', actor_id);
  perform private.delete_rows_if_present('profiles', 'id', actor_id);

  -- Parks are shared community places; keep them but drop the attribution.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'parks'
      and column_name = 'created_by' and is_nullable = 'YES'
  ) then
    execute 'update public.parks set created_by = null where created_by = $1'
      using actor_id;
  end if;

  -- Finally the login itself. Blocks, reports, moderator records and
  -- notifications cascade from here. If an unexpected table still references
  -- this member, the whole deletion rolls back rather than half-completing.
  delete from auth.users where id = actor_id;
end;
$function$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
