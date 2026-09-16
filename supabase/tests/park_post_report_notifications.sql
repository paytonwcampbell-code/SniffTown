-- Run manually in the Supabase SQL editor after applying:
--   20260916160000_add_park_pack_post_moderation.sql
--   20260916170000_harden_park_pack_moderator_management.sql
--   20260916180000_notify_park_post_report_moderators.sql
--
-- This is rollback-only. It creates disposable auth users and park-pack data,
-- exercises the notification trigger and RPC authorization under the
-- authenticated role, and rolls back every change. It requires a SQL-editor
-- session with permission to SET ROLE and insert temporary auth fixtures.
--
-- This file is an activation regression test, not a live migration run.

begin;

set local role postgres;

do $$
declare
  fixture_instance_id uuid := '00000000-0000-4000-8000-000000000002';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values
    ('10000000-0000-4000-8000-000000000011', fixture_instance_id, 'authenticated', 'authenticated', 'notification-creator@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    ('10000000-0000-4000-8000-000000000012', fixture_instance_id, 'authenticated', 'authenticated', 'notification-moderator@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    ('10000000-0000-4000-8000-000000000013', fixture_instance_id, 'authenticated', 'authenticated', 'notification-member@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    ('10000000-0000-4000-8000-000000000014', fixture_instance_id, 'authenticated', 'authenticated', 'notification-reporter@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    ('10000000-0000-4000-8000-000000000015', fixture_instance_id, 'authenticated', 'authenticated', 'notification-author@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.packs (
    id, creator_id, name, location, description, is_public, join_method,
    discoverability, preview_level, max_members, show_human_names,
    hide_events_until_joined, tags
  )
  values (
    '20000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000011',
    'Notification rollback fixture',
    'Rollback-only notification test',
    'Never committed',
    true,
    'auto_approve',
    'public',
    'badges_counts',
    50,
    true,
    true,
    array['rollback-test']
  );

  insert into public.pack_members (pack_id, user_id)
  values
    ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000011'),
    ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000012'),
    ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000013'),
    ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000014'),
    ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000015');

  insert into public.pack_moderators (pack_id, user_id)
  values (
    '20000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000012'
  );

  insert into public.pack_posts (
    id, pack_id, author_id, title, content, post_type
  )
  values
    ('30000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000015', 'Fixture', 'First reportable post', 'general'),
    ('30000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000015', 'Fixture', 'Second reportable post', 'general'),
    ('30000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000015', 'Fixture', 'Third reportable post', 'general');
end
$$;

set local role authenticated;

do $$
declare
  pack_id uuid := '20000000-0000-4000-8000-000000000011';
  creator_id uuid := '10000000-0000-4000-8000-000000000011';
  moderator_id uuid := '10000000-0000-4000-8000-000000000012';
  member_id uuid := '10000000-0000-4000-8000-000000000013';
  reporter_id uuid := '10000000-0000-4000-8000-000000000014';
  report_id uuid;
  creator_notification_id uuid;
  moderator_notification_id uuid;
  creator_count integer;
  moderator_count integer;
  unread_count integer;
  read_count integer;
  creator_data jsonb;
  creator_title text;
  creator_body text;
  creator_notification_created_at timestamp with time zone;
  moderator_notification_created_at timestamp with time zone;
  creator_read_at timestamp with time zone;
begin
  -- A new report fans out to the creator and current designated moderator.
  perform set_config('request.jwt.claim.sub', reporter_id::text, true);
  select reported.report_id
    into report_id
  from public.report_pack_post(
    pack_id,
    '30000000-0000-4000-8000-000000000011',
    'spam'
  ) as reported;

  perform set_config('request.jwt.claim.sub', creator_id::text, true);
  select count(*)
    into creator_count
  from public.list_notifications(100);
  if creator_count <> 1 then
    raise exception 'creator received %, expected one initial moderation alert', creator_count;
  end if;
  select id, data, title, body, created_at
    into creator_notification_id, creator_data, creator_title, creator_body, creator_notification_created_at
  from public.list_notifications(100)
  limit 1;
  if creator_data <> jsonb_build_object(
    'parkId', pack_id::text,
    'packId', pack_id::text,
    'screen', 'moderation'
  ) then
    raise exception 'moderation alert data contract changed: %', creator_data;
  end if;
  if creator_data ?| array['reporterId', 'reporterEmail', 'postContent', 'details'] then
    raise exception 'moderation alert leaked report or post content: %', creator_data;
  end if;
  if creator_title <> 'Park pack post needs review'
     or creator_body <> 'A new report is waiting in the moderation queue.' then
    raise exception 'moderation alert copy changed unexpectedly';
  end if;

  perform set_config('request.jwt.claim.sub', moderator_id::text, true);
  select count(*)
    into moderator_count
  from public.list_notifications(100);
  if moderator_count <> 1 then
    raise exception 'current moderator received %, expected one initial alert', moderator_count;
  end if;
  select id, created_at
    into moderator_notification_id, moderator_notification_created_at
  from public.list_notifications(100)
  limit 1;

  -- A current nonmoderator member cannot read another member's alerts.
  perform set_config('request.jwt.claim.sub', member_id::text, true);
  select count(*) into moderator_count
  from public.list_notifications(100);
  if moderator_count <> 0 then
    raise exception 'nonmoderator received % moderation alerts', moderator_count;
  end if;

  -- A second open report in the same pack coalesces with both unread alerts.
  perform set_config('request.jwt.claim.sub', reporter_id::text, true);
  select reported.report_id
    into report_id
  from public.report_pack_post(
    pack_id,
    '30000000-0000-4000-8000-000000000012',
    'harassment'
  ) as reported;

  perform set_config('request.jwt.claim.sub', creator_id::text, true);
  select count(*) into creator_count
  from public.list_notifications(100);
  if creator_count <> 1 then
    raise exception 'unread duplicate alerts were not coalesced for creator';
  end if;
  perform set_config('request.jwt.claim.sub', moderator_id::text, true);
  select count(*) into moderator_count
  from public.list_notifications(100);
  if moderator_count <> 1 then
    raise exception 'unread duplicate alerts were not coalesced for moderator';
  end if;

  -- A stale read acknowledgment must not consume a newer coalesced alert.
  perform set_config('request.jwt.claim.sub', creator_id::text, true);
  perform public.mark_notification_read(
    creator_notification_id,
    creator_notification_created_at
  );
  select read_at, created_at
    into creator_read_at, creator_notification_created_at
  from public.list_notifications(100)
  where id = creator_notification_id;
  if creator_read_at is not null then
    raise exception 'stale creator acknowledgment marked a newer moderation alert read';
  end if;

  -- Reading the current coalesced alert closes that deduplication window.
  perform public.mark_notification_read(
    creator_notification_id,
    creator_notification_created_at
  );
  select read_at
    into creator_read_at
  from public.list_notifications(100)
  where id = creator_notification_id;
  if creator_read_at is null then
    raise exception 'creator moderation alert was not marked read';
  end if;

  -- A later report creates a fresh unread alert for the creator while the
  -- moderator still has one unread coalesced alert.
  perform set_config('request.jwt.claim.sub', reporter_id::text, true);
  select reported.report_id
    into report_id
  from public.report_pack_post(
    pack_id,
    '30000000-0000-4000-8000-000000000013',
    'unsafe'
  ) as reported;

  perform set_config('request.jwt.claim.sub', creator_id::text, true);
  select
    count(*),
    count(*) filter (where read_at is null),
    count(*) filter (where read_at is not null)
    into creator_count, unread_count, read_count
  from public.list_notifications(100);
  if creator_count <> 2 or unread_count <> 1 or read_count <> 1 then
    raise exception 'read then fresh report produced counts %, unread %, read %', creator_count, unread_count, read_count;
  end if;

  perform set_config('request.jwt.claim.sub', moderator_id::text, true);
  select count(*) into moderator_count
  from public.list_notifications(100);
  if moderator_count <> 1 then
    raise exception 'moderator alert was not coalesced while unread';
  end if;

  -- Repeating the exact same report is rejected by the report uniqueness key
  -- and must not create another moderation alert.
  perform set_config('request.jwt.claim.sub', reporter_id::text, true);
  begin
    perform public.report_pack_post(
      pack_id,
      '30000000-0000-4000-8000-000000000011',
      'spam'
    );
    raise exception 'duplicate report unexpectedly succeeded';
  exception when unique_violation then
    null;
  end;

  perform set_config('request.jwt.claim.sub', creator_id::text, true);
  select count(*) into creator_count
  from public.list_notifications(100);
  if creator_count <> 2 then
    raise exception 'duplicate report created a new alert';
  end if;

  -- A nonmoderator cannot mark a creator's alert read.
  perform set_config('request.jwt.claim.sub', member_id::text, true);
  begin
    perform public.mark_notification_read(
      creator_notification_id,
      creator_notification_created_at
    );
    raise exception 'other member unexpectedly marked a moderation alert read';
  exception when sqlstate 'P0002' then
    null;
  end;

  -- Removing a moderator's membership revokes both role and alert access.
  perform set_config('request.jwt.claim.sub', moderator_id::text, true);
  delete from public.pack_members as pm
  where pm.pack_id = pack_id
    and pm.user_id = moderator_id;

  select count(*) into moderator_count
  from public.list_notifications(100);
  if moderator_count <> 0 then
    raise exception 'removed moderator retained % notification(s)', moderator_count;
  end if;

  begin
    perform public.mark_notification_read(
      moderator_notification_id,
      moderator_notification_created_at
    );
    raise exception 'removed moderator unexpectedly marked a moderation alert read';
  exception when sqlstate 'P0002' then
    null;
  end;
end
$$;

rollback;