-- Moderator assignments are limited to current pack members. Leaving a pack
-- revokes an assignment in the same transaction so a later rejoin cannot
-- restore stale moderation access.

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.is_current_pack_member(
  target_pack_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select target_user_id is not null
    and exists (
      select 1
      from public.pack_members pm
      where pm.pack_id = target_pack_id
        and pm.user_id = target_user_id
    );
$function$;

revoke all on function private.is_current_pack_member(uuid, uuid) from public;

-- Keep the public compatibility helper safe for direct authenticated calls:
-- callers can only ask about their own membership. All trusted definer code
-- uses the private helper above so it can check another member as needed.
create or replace function public.is_current_pack_member(
  target_pack_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select auth.uid() is not null
    and target_user_id = auth.uid()
    and private.is_current_pack_member(target_pack_id, auth.uid());
$function$;

revoke all on function public.is_current_pack_member(uuid, uuid) from public;
grant execute on function public.is_current_pack_member(uuid, uuid) to authenticated;

-- Older community packs may predate the creator-membership invariant. Bring
-- them into the invariant before the stricter creator-only policies below.
insert into public.pack_members (pack_id, user_id)
select p.id, p.creator_id
from public.packs p
where p.is_public is true
  and p.creator_id is not null
  and not exists (
    select 1
    from public.pack_members member
    where member.pack_id = p.id
      and member.user_id = p.creator_id
  )
on conflict (pack_id, user_id) do nothing;

-- Remove assignments left by older versions of the moderation migration
-- before installing the membership guard.
delete from public.pack_moderators pm
where not exists (
  select 1
  from public.pack_members member
  where member.pack_id = pm.pack_id
    and member.user_id = pm.user_id
);

-- Enforce the membership invariant at the database level as well as in the
-- API/RLS checks. This closes the appoint-vs-leave race: deleting a member
-- cascades the role, and a role insert cannot commit without its parent row.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pack_moderators'::regclass
      and conname = 'pack_moderators_current_member_fkey'
  ) then
    alter table public.pack_moderators
      add constraint pack_moderators_current_member_fkey
      foreign key (pack_id, user_id)
      references public.pack_members (pack_id, user_id)
      on delete cascade;
  end if;
end
$$;

drop policy if exists "Pack creators manage moderators"
  on public.pack_moderators;

create policy "Current pack creators manage current member moderators"
  on public.pack_moderators
  for all
  to authenticated
  using (
    public.is_pack_creator(pack_id, auth.uid())
    and public.is_current_pack_member(pack_id, auth.uid())
  )
  with check (
    public.is_pack_creator(pack_id, auth.uid())
    and public.is_current_pack_member(pack_id, auth.uid())
  );

create or replace function public.enforce_pack_moderator_membership()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not private.is_current_pack_member(new.pack_id, new.user_id) then
    raise exception using
      errcode = '23514',
      message = 'Only current park-pack members can be moderators.';
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_pack_moderator_membership
  on public.pack_moderators;
create trigger enforce_pack_moderator_membership
  before insert or update on public.pack_moderators
  for each row
  execute function public.enforce_pack_moderator_membership();

create or replace function public.revoke_pack_moderator_on_membership_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from public.pack_moderators
  where pack_id = old.pack_id
    and user_id = old.user_id;
  return old;
end;
$function$;

drop trigger if exists revoke_pack_moderator_on_membership_delete
  on public.pack_members;
create trigger revoke_pack_moderator_on_membership_delete
  after delete on public.pack_members
  for each row
  execute function public.revoke_pack_moderator_on_membership_delete();

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
  select actor_id is not null
    and private.is_current_pack_member(target_pack_id, actor_id)
    and (
      exists (
        select 1
        from public.packs p
        where p.id = target_pack_id
          and p.creator_id = actor_id
      )
      or exists (
        select 1
        from public.pack_moderators pm
        where pm.pack_id = target_pack_id
          and pm.user_id = actor_id
      )
    );
$function$;

create or replace function public.get_pack_moderator_members(
  target_pack_id uuid
)
returns table(
  creator_id uuid,
  user_id uuid,
  display_name text,
  is_moderator boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  pack_creator_id uuid;
begin
  select p.creator_id
    into pack_creator_id
  from public.packs p
  where p.id = target_pack_id;

  if pack_creator_id is null
     or auth.uid() is null
     or auth.uid() <> pack_creator_id
     or not private.is_current_pack_member(target_pack_id, auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'Only a current pack creator can manage moderators.';
  end if;

  return query
  select
    pack_creator_id,
    member.user_id,
    case
      when coalesce(up.name_display, 'initial') = 'full' then
        coalesce(p.full_name, 'Pack Member')
      when coalesce(up.name_display, 'initial') = 'initial' then
        case
          when p.full_name is not null then
            split_part(p.full_name, ' ', 1) || ' ' ||
            coalesce(left(split_part(p.full_name, ' ', 2), 1) || '.', '')
          else 'Pack Member'
        end
      else 'Pack Member'
    end,
    member.user_id = pack_creator_id
      or exists (
        select 1
        from public.pack_moderators moderator
        where moderator.pack_id = target_pack_id
          and moderator.user_id = member.user_id
      )
  from public.pack_members member
  left join public.profiles p on p.id = member.user_id
  left join public.user_privacy up on up.user_id = member.user_id
  where member.pack_id = target_pack_id
  order by member.user_id;
end;
$function$;

create or replace function public.appoint_pack_moderator(
  target_pack_id uuid,
  target_user_id uuid
)
returns table(user_id uuid, display_name text, is_moderator boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null
     or not public.is_pack_creator(target_pack_id, auth.uid())
     or not private.is_current_pack_member(target_pack_id, auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'Only a current pack creator can manage moderators.';
  end if;

  if not private.is_current_pack_member(target_pack_id, target_user_id) then
    raise exception using
      errcode = 'P0002',
      message = 'The selected user is not a current park-pack member.';
  end if;

  insert into public.pack_moderators(pack_id, user_id)
  values (target_pack_id, target_user_id)
  on conflict (pack_id, user_id) do nothing;

  return query
  select listed.user_id, listed.display_name, listed.is_moderator
  from public.get_pack_moderator_members(target_pack_id) listed
  where listed.user_id = target_user_id;
end;
$function$;

create or replace function public.remove_pack_moderator(
  target_pack_id uuid,
  target_user_id uuid
)
returns table(user_id uuid, display_name text, is_moderator boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null
     or not public.is_pack_creator(target_pack_id, auth.uid())
     or not private.is_current_pack_member(target_pack_id, auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'Only a current pack creator can manage moderators.';
  end if;

  if not private.is_current_pack_member(target_pack_id, target_user_id) then
    raise exception using
      errcode = 'P0002',
      message = 'The selected user is not a current park-pack member.';
  end if;

  if exists (
    select 1
    from public.packs p
    where p.id = target_pack_id
      and p.creator_id = target_user_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Pack creators are always moderators.';
  end if;

  delete from public.pack_moderators
  where pack_id = target_pack_id
    and user_id = target_user_id;

  return query
  select listed.user_id, listed.display_name, listed.is_moderator
  from public.get_pack_moderator_members(target_pack_id) listed
  where listed.user_id = target_user_id;
end;
$function$;

revoke all on function public.is_pack_moderator(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_pack_moderator_members(uuid) from public;
revoke all on function public.appoint_pack_moderator(uuid, uuid) from public;
revoke all on function public.remove_pack_moderator(uuid, uuid) from public;
revoke all on function public.enforce_pack_moderator_membership() from public;
revoke all on function public.revoke_pack_moderator_on_membership_delete() from public;
grant execute on function public.get_pack_moderator_members(uuid) to authenticated;
grant execute on function public.appoint_pack_moderator(uuid, uuid) to authenticated;
grant execute on function public.remove_pack_moderator(uuid, uuid) to authenticated;