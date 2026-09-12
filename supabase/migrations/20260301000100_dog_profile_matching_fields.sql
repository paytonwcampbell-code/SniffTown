-- Additive dog-profile fields for lightweight intent and compatibility matching.
-- Existing rows keep their current values and all existing RLS policies remain in place.

ALTER TABLE public.dogs
  ADD COLUMN IF NOT EXISTS looking_for text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS looking_for_note text,
  ADD COLUMN IF NOT EXISTS energy_level text,
  ADD COLUMN IF NOT EXISTS play_styles text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS compatible_with text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS not_good_fit_with text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS availability text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS meetup_preferences text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS sitting_interests text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.dogs
  ADD CONSTRAINT dogs_energy_level_check
  CHECK (
    energy_level IS NULL
    OR energy_level IN ('low', 'medium', 'high')
  );

COMMENT ON COLUMN public.dogs.looking_for IS
  'Selectable meetup intents such as dog_walk, playdate, or dog_sitting_swap.';
COMMENT ON COLUMN public.dogs.looking_for_note IS
  'Optional short note about the member''s meetup interests; not a storage fallback for structured fields.';
COMMENT ON COLUMN public.dogs.compatible_with IS
  'Selectable dog groups this dog usually does well with.';
COMMENT ON COLUMN public.dogs.not_good_fit_with IS
  'Optional selectable dog groups that may not be a good fit.';
COMMENT ON COLUMN public.dogs.sitting_interests IS
  'Optional pet-sitting/trade-off interests shown only when a care intent is selected.';

CREATE OR REPLACE FUNCTION public.get_dogs_for_matching_v2()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  name text,
  breed text,
  age text,
  size text,
  temperament text[],
  preferences text[],
  description text,
  photo_url text,
  preferred_gender text[],
  preferred_size text[],
  preferred_age text[],
  preferred_energy text[],
  location_city text,
  location_state text,
  home_metro_id uuid,
  looking_for text[],
  looking_for_note text,
  energy_level text,
  play_styles text[],
  compatible_with text[],
  not_good_fit_with text[],
  availability text[],
  meetup_preferences text[],
  sitting_interests text[],
  distance_miles numeric,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id,
    d.user_id,
    d.name,
    d.breed,
    d.age,
    d.size,
    d.temperament,
    d.preferences,
    d.description,
    d.photo_url,
    d.preferred_gender,
    d.preferred_size,
    d.preferred_age,
    d.preferred_energy,
    d.location_city,
    d.location_state,
    d.home_metro_id,
    d.looking_for,
    d.looking_for_note,
    d.energy_level,
    d.play_styles,
    d.compatible_with,
    d.not_good_fit_with,
    d.availability,
    d.meetup_preferences,
    d.sitting_interests,
    CASE
      WHEN origin.latitude IS NULL
        OR origin.longitude IS NULL
        OR d.latitude IS NULL
        OR d.longitude IS NULL
      THEN NULL
      ELSE round((
        3958.8 * 2 * asin(sqrt(
          power(sin(radians(d.latitude - origin.latitude) / 2), 2)
          + cos(radians(origin.latitude))
            * cos(radians(d.latitude))
            * power(sin(radians(d.longitude - origin.longitude) / 2), 2)
        ))
      )::numeric * 2) / 2
    END AS distance_miles,
    d.created_at
  FROM public.dogs AS d
  LEFT JOIN LATERAL (
    SELECT own.latitude, own.longitude
    FROM public.dogs AS own
    WHERE own.user_id = auth.uid()
      AND own.latitude IS NOT NULL
      AND own.longitude IS NOT NULL
    ORDER BY own.updated_at DESC NULLS LAST, own.created_at DESC NULLS LAST
    LIMIT 1
  ) AS origin ON true
  WHERE d.user_id <> auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_dogs_for_matching_v2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dogs_for_matching_v2() TO anon, authenticated;