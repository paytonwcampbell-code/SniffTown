-- Keep moderation alerts in the authenticated in-app notification stream.
-- The alert intentionally contains only a safe navigation target: it never
-- includes the reporter, report reason/details, or post content.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  pack_id uuid not null references public.packs(id) on delete cascade,
  title text not null,
  body text not null,
  data jsonb not null,
  created_at timestamp with time zone not null default now(),
  read_at timestamp with time zone,
  constraint notifications_type_check
    check (type in ('park_post_report')),
  constraint notifications_park_post_report_copy_check
    check (
      type <> 'park_post_report'
      or (
        title = 'Park pack post needs review'
        and body = 'A new report is waiting in the moderation queue.'
      )
    ),
  constraint notifications_park_post_report_data_check
    check (
      type <> 'park_post_report'
      or (
        jsonb_typeof(data) = 'object'
        and data ?& array['parkId', 'packId', 'screen']
        and jsonb_typeof(data->'parkId') = 'string'
        and jsonb_typeof(data->'packId') = 'string'
        and data->>'parkId' = pack_id::text
        and data->>'packId' = pack_id::text
        and data->>'screen' = 'moderation'
        and (data - 'parkId' - 'packId' - 'screen') = '{}'::jsonb
      )
    )
);

-- An unread alert is the coalescing window. Once a moderator reads it, a
-- later report can create a fresh alert while still reusing the same alert
-- for concurrent/new reports in the same open queue.
create unique index if not exists notifications_unread_park_report_recipient_pack_idx
  on public.notifications (recipient_id, pack_id)
  where type = 'park_post_report' and read_at is null;

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Current moderators can read their notifications"
  on public.notifications;
create policy "Current moderators can read their notifications"
  on public.notifications
  for select
  to authenticated
  using (
    recipient_id = auth.uid()
    and public.is_pack_moderator(pack_id, auth.uid())
  );

create or replace function public.enqueue_park_post_report_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status <> 'open' then
    return new;
  end if;

  -- The pack creator is always included. Explicit moderators are included
  -- only while they remain current members, so a stale assignment can never
  -- receive an alert.
  insert into public.notifications (
    recipient_id,
    type,
    pack_id,
    title,
    body,
    data
  )
  select
    recipients.user_id,
    'park_post_report',
    new.pack_id,
    'Park pack post needs review',
    'A new report is waiting in the moderation queue.',
    jsonb_build_object(
      'parkId', new.pack_id::text,
      'packId', new.pack_id::text,
      'screen', 'moderation'
    )
  from (
    select p.creator_id as user_id
    from public.packs p
    where p.id = new.pack_id
    union
    select pm.user_id
    from public.pack_moderators pm
    join public.pack_members member
      on member.pack_id = pm.pack_id
     and member.user_id = pm.user_id
    where pm.pack_id = new.pack_id
  ) recipients
  where recipients.user_id is not null
  on conflict (recipient_id, pack_id)
    where type = 'park_post_report' and read_at is null
  do update
    set created_at = greatest(
          public.notifications.created_at + interval '1 microsecond',
          clock_timestamp()
        ),
        data = excluded.data;

  return new;
end;
$function$;

drop trigger if exists enqueue_park_post_report_notification
  on public.pack_post_reports;
create trigger enqueue_park_post_report_notification
  after insert on public.pack_post_reports
  for each row
  execute function public.enqueue_park_post_report_notification();

-- Existing open reports should be visible after activation as well. The same
-- unique index makes this backfill safe to rerun and coalesces one alert per
-- current recipient and pack.
insert into public.notifications (
  recipient_id,
  type,
  pack_id,
  title,
  body,
  data
)
select
  recipients.user_id,
  'park_post_report',
  reports.pack_id,
  'Park pack post needs review',
  'A new report is waiting in the moderation queue.',
  jsonb_build_object(
    'parkId', reports.pack_id::text,
    'packId', reports.pack_id::text,
    'screen', 'moderation'
  )
from (
  select distinct pack_id
  from public.pack_post_reports
  where status = 'open'
) reports
join lateral (
  select p.creator_id as user_id
  from public.packs p
  where p.id = reports.pack_id
  union
  select pm.user_id
  from public.pack_moderators pm
  join public.pack_members member
    on member.pack_id = pm.pack_id
   and member.user_id = pm.user_id
  where pm.pack_id = reports.pack_id
) recipients on true
where recipients.user_id is not null
on conflict (recipient_id, pack_id)
  where type = 'park_post_report' and read_at is null
do nothing;

create or replace function public.list_notifications(
  target_limit integer default 50
)
returns table(
  id uuid,
  type text,
  title text,
  body text,
  data jsonb,
  created_at timestamp with time zone,
  read_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  bounded_limit integer := least(greatest(coalesce(target_limit, 50), 1), 100);
begin
  if actor_id is null then
    raise exception using
      errcode = '42501',
      message = 'Sign in to view notifications.';
  end if;

  return query
  select
    n.id,
    n.type,
    n.title,
    n.body,
    n.data,
    n.created_at,
    n.read_at
  from public.notifications n
  where n.recipient_id = actor_id
    and public.is_pack_moderator(n.pack_id, actor_id)
  order by n.created_at desc
  limit bounded_limit;
end;
$function$;

create or replace function public.mark_notification_read(
  target_notification_id uuid,
  target_created_at timestamp with time zone
)
returns table(
  id uuid,
  read_at timestamp with time zone
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_id uuid := auth.uid();
  notification_row public.notifications%rowtype;
begin
  if actor_id is null then
    raise exception using
      errcode = '42501',
      message = 'Sign in to update notifications.';
  end if;

  if target_notification_id is null or target_created_at is null then
    raise exception using
      errcode = '22023',
      message = 'Notification id and revision are required.';
  end if;

  select n.*
    into notification_row
  from public.notifications n
  where n.id = target_notification_id
    and n.recipient_id = actor_id
    and public.is_pack_moderator(n.pack_id, actor_id)
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Notification not found.';
  end if;

  -- The client acknowledges the exact list snapshot it observed. A later
  -- report may have coalesced into this unread row while the request was in
  -- flight, so never mark that newer alert as read using a stale timestamp.
  if notification_row.created_at <> target_created_at then
    return query
    select notification_row.id, notification_row.read_at;
    return;
  end if;

  update public.notifications as n
   set read_at = coalesce(notification_row.read_at, clock_timestamp())
  where n.id = notification_row.id;

  return query
  select notification_row.id, n.read_at
  from public.notifications n
  where n.id = notification_row.id;
end;
$function$;

revoke all on table public.notifications from anon, authenticated;
revoke all on function public.enqueue_park_post_report_notification() from public;
revoke all on function public.list_notifications(integer) from public;
revoke all on function public.mark_notification_read(uuid, timestamp with time zone) from public;
grant execute on function public.list_notifications(integer) to authenticated;
grant execute on function public.mark_notification_read(uuid, timestamp with time zone) to authenticated;