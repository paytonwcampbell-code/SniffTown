-- A pack creator keeps pack access for the lifetime of the pack. They may
-- still remove another member, but cannot remove their own membership.
drop policy if exists "Pack creators and members can remove members"
  on public.pack_members;

create policy "Pack creators and members can remove members"
  on public.pack_members
  for delete
  to public
  using (
    (
      auth.uid() = user_id
      and not public.is_pack_creator(pack_id, auth.uid())
    )
    or (
      pack_id in (
        select p.id
        from public.packs p
        where p.creator_id = auth.uid()
      )
      and user_id <> auth.uid()
    )
  );

-- The API treats creators as pack members for private board access. Include
-- their dog in the existing safe member RPC even if an older pack is missing
-- the creator's membership row.
create or replace function public.get_pack_member_dogs_safe(target_pack_id uuid)
returns table(
  id uuid,
  user_id uuid,
  name text,
  breed text,
  age text,
  size text,
  temperament text[],
  description text,
  photo_url text,
  updated_at timestamp with time zone
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    d.id,
    d.user_id,
    d.name,
    d.breed,
    d.age,
    d.size,
    d.temperament,
    d.description,
    d.photo_url,
    d.updated_at
  from public.dogs d
  where (
    exists (
      select 1
      from public.pack_members pm
      where pm.pack_id = target_pack_id
        and pm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.packs p
      where p.id = target_pack_id
        and p.creator_id = auth.uid()
    )
  )
  and exists (
    select 1
    from public.pack_members pm2
    where pm2.pack_id = target_pack_id
      and pm2.user_id = d.user_id
  )
  order by d.updated_at desc;
$function$;