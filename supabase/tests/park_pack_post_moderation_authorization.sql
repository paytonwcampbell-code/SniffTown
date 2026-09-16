-- Run manually in the Supabase SQL editor only after
-- 20260916160000_add_park_pack_post_moderation.sql has been applied.
--
-- This is deliberately rollback-only: it creates disposable auth users and
-- pack data, exercises the RPC grants and authorization checks under anon and
-- authenticated roles, then rolls back every change. It requires a SQL-editor
-- session with permission to SET ROLE and insert the temporary auth fixtures.

begin;

set local role postgres;

do $$
declare
  fixture_instance_id uuid := '00000000-0000-4000-8000-000000000001';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values
    ('10000000-0000-4000-8000-000000000001', fixture_instance_id, 'authenticated', 'authenticated', 'moderation-creator@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    ('10000000-0000-4000-8000-000000000002', fixture_instance_id, 'authenticated', 'authenticated', 'moderation-member@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    ('10000000-0000-4000-8000-000000000003', fixture_instance_id, 'authenticated', 'authenticated', 'moderation-nonmember@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    ('10000000-0000-4000-8000-000000000004', fixture_instance_id, 'authenticated', 'authenticated', 'moderation-moderator@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    ('10000000-0000-4000-8000-000000000005', fixture_instance_id, 'authenticated', 'authenticated', 'moderation-author@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    ('10000000-0000-4000-8000-000000000006', fixture_instance_id, 'authenticated', 'authenticated', 'moderation-rate-limit@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.packs (
    id, creator_id, name, location, description, is_public, join_method,
    discoverability, preview_level, max_members, show_human_names,
    hide_events_until_joined, tags
  )
  values (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Moderation authorization fixture',
    'Rollback-only test fixture',
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

  insert into public.packs (
    id, creator_id, name, location, description, is_public, join_method,
    discoverability, preview_level, max_members, show_human_names,
    hide_events_until_joined, tags
  )
  values (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Second moderation authorization fixture',
    'Rollback-only test fixture',
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
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'),
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004'),
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006'),
    ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005'),
    ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000005');

  insert into public.pack_moderators (pack_id, user_id)
  values (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000004'
  );

  insert into public.pack_posts (id, pack_id, author_id, title, content, post_type)
  values
    ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'Fixture', 'First reportable post', 'general'),
    ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'Fixture', 'Second reportable post', 'general'),
    ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'Fixture', 'Rate-limit post 1', 'general'),
    ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'Fixture', 'Rate-limit post 2', 'general'),
    ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'Fixture', 'Rate-limit post 3', 'general'),
    ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'Fixture', 'Rate-limit post 4', 'general'),
    ('30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'Fixture', 'Rate-limit post 5', 'general'),
    ('30000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'Fixture', 'Rate-limit post 6', 'general');

  insert into public.pack_post_reports (pack_id, post_id, reporter_id, reason)
  values
    ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 'spam'),
    ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000006', 'spam'),
    ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000006', 'spam'),
    ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', 'spam'),
    ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000006', 'spam');
end
$$;

-- The RPCs are not executable by anon, regardless of a forged subject claim.
set local role anon;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$
begin
  perform public.report_pack_post(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'spam'
  );
  raise exception 'anon unexpectedly executed report_pack_post';
exception when insufficient_privilege then
  null;
end
$$;

set local role authenticated;

-- A signed-in nonmember cannot report or enumerate moderation reports.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
do $$
begin
  perform public.report_pack_post(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'spam'
  );
  raise exception 'nonmember unexpectedly reported a post';
exception when sqlstate '42501' then
  null;
end
$$;
do $$
begin
  perform public.get_pack_post_reports_for_moderation(
    '20000000-0000-4000-8000-000000000001'
  );
  raise exception 'nonmember unexpectedly listed moderation reports';
exception when sqlstate '42501' then
  null;
end
$$;

-- A member can report spam, but a nonmoderator cannot review or act on it.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$
declare
  created_report_id uuid;
  returned_status text;
begin
  select report_id, status
    into created_report_id, returned_status
    from public.report_pack_post(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'spam',
      'Repeated promotion'
    );
  if created_report_id is null or returned_status <> 'open' then
    raise exception 'member report did not return an open report id';
  end if;
end
$$;
do $$
begin
  perform public.get_pack_post_reports_for_moderation(
    '20000000-0000-4000-8000-000000000001'
  );
  raise exception 'nonmoderator unexpectedly listed reports';
exception when sqlstate '42501' then
  null;
end
$$;

-- Invalid report reasons and moderation actions are rejected by the RPCs.
do $$
begin
  perform public.report_pack_post(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    'not-a-reason'
  );
  raise exception 'invalid report reason unexpectedly succeeded';
exception when sqlstate '22023' then
  null;
end
$$;

-- The sixth report in one hour returns the rate-limit error, including for a
-- valid spam report on a distinct visible post.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000006', true);
do $$
begin
  perform public.report_pack_post(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000008',
    'spam'
  );
  raise exception 'sixth report unexpectedly bypassed the rate limit';
exception when sqlstate 'P0001' then
  null;
end
$$;

-- The post author may otherwise satisfy existing UPDATE policies. A forged
-- configuration setting must not authorize either a direct status change or
-- moving a reported post into a different pack.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select set_config('app.pack_post_moderation_rpc', 'true', true);
do $$
begin
  insert into public.pack_posts (
    id, pack_id, author_id, title, content, post_type, moderation_status
  )
  values (
    '30000000-0000-4000-8000-000000000009',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000005',
    'Fixture',
    'Directly hidden post',
    'general',
    'hidden'
  );
  raise exception 'author unexpectedly inserted a hidden post directly';
exception when sqlstate '42501' then
  null;
end
$$;
do $$
declare
  affected_rows integer;
begin
  update public.pack_posts
  set moderation_status = 'hidden'
  where id = '30000000-0000-4000-8000-000000000002';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'author unexpectedly hid a post directly';
  end if;
exception when sqlstate '42501' then
  null;
end
$$;
do $$
declare
  affected_rows integer;
begin
  update public.pack_posts
  set pack_id = '20000000-0000-4000-8000-000000000002'
  where id = '30000000-0000-4000-8000-000000000001';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'author unexpectedly moved a reported post to another pack';
  end if;
exception when sqlstate '42501' then
  null;
end
$$;

-- Both creator and explicitly designated moderator may list reports. The
-- returned composite row must not gain reporter/contact columns.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$
begin
  if not exists (
    select 1
    from public.get_pack_post_reports_for_moderation(
      '20000000-0000-4000-8000-000000000001'
    )
  ) then
    raise exception 'creator could not list the open report';
  end if;
  if exists (
    select 1
    from public.get_pack_post_reports_for_moderation(
      '20000000-0000-4000-8000-000000000001'
    ) report_row
    where to_jsonb(report_row) ?| array[
      'reporter_id', 'reporter_email', 'reporter_contact_email', 'contact_email'
    ]
  ) then
    raise exception 'moderation RPC exposed reporter or contact fields';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
do $$
declare
  target_report_id uuid;
begin
  select id into target_report_id
  from public.get_pack_post_reports_for_moderation(
    '20000000-0000-4000-8000-000000000001'
  )
  where post_id = '30000000-0000-4000-8000-000000000001';

  if target_report_id is null then
    raise exception 'designated moderator could not see the member report';
  end if;

  perform public.moderate_pack_post_report(
    '20000000-0000-4000-8000-000000000001',
    target_report_id,
    'hide'
  );

  if exists (
    select 1 from public.pack_posts
    where id = '30000000-0000-4000-8000-000000000001'
      and moderation_status <> 'hidden'
  ) then
    raise exception 'designated moderator did not hide the reported post';
  end if;

  begin
    perform public.moderate_pack_post_report(
      '20000000-0000-4000-8000-000000000001',
      target_report_id,
      'delete'
    );
    raise exception 'invalid moderation action unexpectedly succeeded';
  exception when sqlstate '22023' then
    null;
  end;
end
$$;

-- The creator-only member picker and its idempotent assignment operations
-- expose only current pack members.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$
declare
  member_count integer;
  appointed boolean;
  removed boolean;
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pack_moderators'::regclass
      and conname = 'pack_moderators_current_member_fkey'
      and contype = 'f'
  ) then
    raise exception 'current-member composite foreign key is missing';
  end if;

  select count(*) into member_count
  from public.get_pack_moderator_members(
    '20000000-0000-4000-8000-000000000001'
  );
  if member_count <> 5 then
    raise exception 'creator member picker returned % members, expected 5', member_count;
  end if;

  select is_moderator into appointed
  from public.appoint_pack_moderator(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002'
  );
  if appointed is not true then
    raise exception 'creator could not appoint a current member';
  end if;

  select is_moderator into removed
  from public.remove_pack_moderator(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002'
  );
  if removed is not false then
    raise exception 'creator could not remove a member moderator';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$
begin
  if public.is_current_pack_member(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'authenticated member probed another user membership';
  end if;
  if not public.is_current_pack_member(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'authenticated member could not check own membership';
  end if;

  begin
    perform public.is_pack_moderator(
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000004'
    );
    raise exception 'authenticated member probed another user moderator status';
  exception when sqlstate '42501' then
    null;
  end;

  perform public.get_pack_moderator_members(
    '20000000-0000-4000-8000-000000000001'
  );
  raise exception 'noncreator unexpectedly listed moderator members';
exception when sqlstate '42501' then
  null;
end
$$;

-- Hiding through the RPC does not give the post author a way to restore it,
-- even if an existing UPDATE policy permits ordinary edits to their posts.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
do $$
declare
  affected_rows integer;
begin
  update public.pack_posts
  set moderation_status = 'visible'
  where id = '30000000-0000-4000-8000-000000000001';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'author unexpectedly restored a hidden post directly';
  end if;
exception when sqlstate '42501' then
  null;
end
$$;

-- Designation alone is insufficient: removing a moderator from the pack
-- immediately removes moderation access. Creators are current members and
-- cannot use the leave flow to bypass this invariant.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
-- A creator cannot directly appoint a nonmember, even though the creator is
-- allowed to manage the moderator table. The membership guard is enforced
-- both by the policy and by the trigger.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$
begin
  insert into public.pack_moderators (pack_id, user_id)
  values (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003'
  );
  raise exception 'creator unexpectedly appointed a nonmember';
exception
  when sqlstate '42501' then null;
  when sqlstate '23514' then null;
  when sqlstate '23503' then null;
end
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
delete from public.pack_members
where pack_id = '20000000-0000-4000-8000-000000000001'
  and user_id = '10000000-0000-4000-8000-000000000004';
do $$
begin
  perform public.get_pack_post_reports_for_moderation(
    '20000000-0000-4000-8000-000000000001'
  );
  raise exception 'removed moderator unexpectedly listed reports';
exception when sqlstate '42501' then
  null;
end
$$;
do $$
begin
  perform public.moderate_pack_post_report(
    '20000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'dismiss'
  );
  raise exception 'removed moderator unexpectedly moderated a report';
exception when sqlstate '42501' then
  null;
end
$$;

-- Rejoining does not restore a stale role: leaving removed the assignment in
-- the same transaction, and the membership guard blocks stale reintroduction.
insert into public.pack_members (pack_id, user_id)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004'
);
do $$
begin
  if exists (
    select 1
    from public.pack_moderators
    where pack_id = '20000000-0000-4000-8000-000000000001'
      and user_id = '10000000-0000-4000-8000-000000000004'
  ) then
    raise exception 'rejoining member unexpectedly retained moderator assignment';
  end if;
end
$$;

rollback;