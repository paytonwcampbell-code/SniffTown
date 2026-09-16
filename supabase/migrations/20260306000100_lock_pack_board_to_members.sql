-- Park-pack metadata remains publicly discoverable, but the board itself is
-- private to pack members (including the creator). The existing member-safe
-- RPCs are used by the API for dog-linked member and post responses.

drop policy if exists "Anyone can view posts in public packs" on public.pack_posts;
drop policy if exists "Users can view posts based on pack access and privacy" on public.pack_posts;

create policy "Pack members can view posts"
  on public.pack_posts
  for select
  to public
  using (public.user_can_access_pack(pack_id, auth.uid()));

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
  -- A public pack's metadata is safe to preview, but its board is not.
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
  order by pp.is_pinned desc, pp.created_at desc;
end;
$function$;