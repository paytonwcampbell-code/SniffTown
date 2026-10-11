-- Run manually in the Supabase SQL editor after applying:
--   20261011120000_account_deletion_blocks_and_user_reports.sql
--
-- This is rollback-only. It creates disposable auth users, packs, dogs and
-- messages, exercises blocking, member reports and self-service account
-- deletion under the authenticated role, and rolls back every change.

begin;

set local role postgres;

do $$
declare
  fixture_instance_id uuid := '00000000-0000-4000-8000-000000000003';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values
    ('10000000-0000-4000-8000-000000000021', fixture_instance_id, 'authenticated', 'authenticated', 'leaving-member@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    ('10000000-0000-4000-8000-000000000022', fixture_instance_id, 'authenticated', 'authenticated', 'staying-moderator@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    ('10000000-0000-4000-8000-000000000023', fixture_instance_id, 'authenticated', 'authenticated', 'staying-member@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.packs (
    id, creator_id, name, location, description, is_public, join_method,
    discoverability, preview_level, max_members, show_human_names,
    hide_events_until_joined, tags
  )
  values
    ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000021', 'Shared pack fixture', 'Rollback-only account test', 'Never committed', true, 'auto_approve', 'public', 'badges_counts', 50, true, true, array['rollback-test']),
    ('20000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000021', 'Solo pack fixture', 'Rollback-only account test', 'Never committed', true, 'auto_approve', 'public', 'badges_counts', 50, true, true, array['rollback-test']);

  insert into public.pack_members (pack_id, user_id)
  values
    ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000021'),
    ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000022'),
    ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000023'),
    ('20000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000021');

  insert into public.pack_moderators (pack_id, user_id)
  values ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000022');

  insert into public.pack_posts (pack_id, author_id, title, content)
  values
    ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000021', 'Leaving member fixture', 'Post by the leaving member'),
    ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000023', 'Staying member fixture', 'Post by a staying member'),
    ('20000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000021', 'Solo pack fixture', 'Post in the solo pack');

  insert into public.dogs (id, user_id, name)
  values
    ('40000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000021', 'Leaving dog'),
    ('40000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000022', 'Moderator dog'),
    ('40000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000023', 'Staying dog');

  insert into public.dog_familiars (marker_user_id, marked_dog_id)
  values
    ('10000000-0000-4000-8000-000000000023', '40000000-0000-4000-8000-000000000021'),
    ('10000000-0000-4000-8000-000000000023', '40000000-0000-4000-8000-000000000022'),
    ('10000000-0000-4000-8000-000000000022', '40000000-0000-4000-8000-000000000023'),
    ('10000000-0000-4000-8000-000000000021', '40000000-0000-4000-8000-000000000023');
end
$$;

set local role authenticated;

do $$
declare
  leaving_id uuid := '10000000-0000-4000-8000-000000000021';
  moderator_id uuid := '10000000-0000-4000-8000-000000000022';
  member_id uuid := '10000000-0000-4000-8000-000000000023';
  shared_pack_id uuid := '20000000-0000-4000-8000-000000000021';
  solo_pack_id uuid := '20000000-0000-4000-8000-000000000022';
  row_count integer;
begin
  -- Messaging works before anyone blocks.
  perform set_config('request.jwt.claim.sub', leaving_id::text, true);
  insert into public.conversations (participant_1_id, participant_2_id)
  values (leaving_id, member_id);
  insert into public.messages (sender_id, receiver_id, content)
  values (leaving_id, member_id, 'Hello from the leaving member');

  perform set_config('request.jwt.claim.sub', member_id::text, true);
  insert into public.messages (sender_id, receiver_id, content)
  values (member_id, leaving_id, 'Hello back');

  -- Blocking.
  perform set_config('request.jwt.claim.sub', moderator_id::text, true);
  -- Establish ordinary messaging eligibility first; unblocking must restore
  -- that permission, not bypass SniffTown's existing relationship rules.
  insert into public.conversations (participant_1_id, participant_2_id)
  values (moderator_id, member_id);
  insert into public.messages (sender_id, receiver_id, content)
  values (moderator_id, member_id, 'Eligible before blocking');
  insert into public.user_blocks (blocker_id, blocked_id) values (moderator_id, member_id);

  begin
    insert into public.user_blocks (blocker_id, blocked_id) values (member_id, moderator_id);
    raise exception 'a member created a block on behalf of someone else';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.user_blocks (blocker_id, blocked_id) values (moderator_id, moderator_id);
    raise exception 'a member blocked themselves';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.messages (sender_id, receiver_id, content)
    values (moderator_id, member_id, 'Blocker should not be able to send');
    raise exception 'the blocker messaged the member they blocked';
  exception when insufficient_privilege then
    null;
  end;

  perform set_config('request.jwt.claim.sub', member_id::text, true);
  begin
    insert into public.messages (sender_id, receiver_id, content)
    values (member_id, moderator_id, 'Blocked member should not be able to send');
    raise exception 'a blocked member messaged the member who blocked them';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.conversations (participant_1_id, participant_2_id)
    values (member_id, moderator_id);
    raise exception 'a blocked member started a conversation';
  exception when insufficient_privilege then
    null;
  end;

  select count(*) into row_count from public.user_blocks;
  if row_count <> 0 then
    raise exception 'blocked member can see % block rows; blocks must stay private', row_count;
  end if;

  if not public.is_blocked_with(moderator_id) then
    raise exception 'is_blocked_with did not detect a block against the current member';
  end if;

  -- Unblocking restores messaging.
  perform set_config('request.jwt.claim.sub', moderator_id::text, true);
  delete from public.user_blocks where blocker_id = moderator_id and blocked_id = member_id;
  insert into public.messages (sender_id, receiver_id, content)
  values (moderator_id, member_id, 'Unblocked again');

  -- Member reports.
  perform set_config('request.jwt.claim.sub', member_id::text, true);
  perform public.report_user(leaving_id, 'conversation', 'harassment', '  Rude message  ');

  begin
    perform public.report_user(member_id, 'conversation', 'spam', null);
    raise exception 'a member reported themselves';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    perform public.report_user(leaving_id, 'conversation', 'not-a-reason', null);
    raise exception 'an invalid report reason was accepted';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    perform count(*) from public.user_reports;
    raise exception 'a member could read the private report queue';
  exception when insufficient_privilege then
    null;
  end;

  -- Account deletion.
  perform set_config('request.jwt.claim.sub', leaving_id::text, true);
  perform public.delete_my_account();
end
$$;

set local role postgres;

do $$
declare
  leaving_id uuid := '10000000-0000-4000-8000-000000000021';
  moderator_id uuid := '10000000-0000-4000-8000-000000000022';
  member_id uuid := '10000000-0000-4000-8000-000000000023';
  shared_pack_id uuid := '20000000-0000-4000-8000-000000000021';
  solo_pack_id uuid := '20000000-0000-4000-8000-000000000022';
  next_creator uuid;
begin
  if exists (select 1 from auth.users where id = leaving_id) then
    raise exception 'the deleted member still has a login';
  end if;

  if exists (select 1 from public.dogs where user_id = leaving_id)
     or exists (select 1 from public.pack_members where user_id = leaving_id)
     or exists (select 1 from public.pack_posts where author_id = leaving_id)
     or exists (select 1 from public.messages where leaving_id in (sender_id, receiver_id))
     or exists (select 1 from public.conversations where leaving_id in (participant_1_id, participant_2_id))
     or exists (select 1 from public.dog_familiars where marker_user_id = leaving_id)
     or exists (select 1 from public.dog_familiars where marked_dog_id = '40000000-0000-4000-8000-000000000021')
     or exists (select 1 from public.user_reports where reported_user_id = leaving_id) then
    raise exception 'the deleted member left data behind';
  end if;

  select creator_id into next_creator from public.packs where id = shared_pack_id;
  if next_creator is distinct from moderator_id then
    raise exception 'shared pack was handed to %, expected the remaining moderator', next_creator;
  end if;

  if exists (select 1 from public.packs where id = solo_pack_id) then
    raise exception 'a pack with no remaining members was kept';
  end if;

  if not exists (select 1 from public.pack_posts where author_id = member_id)
     or not exists (select 1 from public.dogs where user_id = member_id)
     or not exists (select 1 from public.pack_members where pack_id = shared_pack_id and user_id = member_id)
     or not exists (select 1 from public.messages where sender_id = moderator_id and receiver_id = member_id) then
    raise exception 'deleting one account removed another member''s data';
  end if;
end
$$;

set local role anon;

do $$
begin
  perform public.delete_my_account();
  raise exception 'an anonymous caller could run delete_my_account';
exception when insufficient_privilege then
  null;
end
$$;

rollback;
