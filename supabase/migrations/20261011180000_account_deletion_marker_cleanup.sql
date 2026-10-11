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
  perform private.delete_rows_if_present('dog_familiars', 'marker_user_id', actor_id);
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
