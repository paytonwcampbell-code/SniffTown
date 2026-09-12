export const LOOKING_FOR_VALUES = [
  "dog_walk",
  "playdate",
  "park_meetup",
  "dog_friendly_date",
  "friendship",
  "regular_walking_buddy",
  "dog_sitting_swap",
  "occasional_dropoff_help",
  "other",
] as const;

export const PLAY_STYLE_VALUES = [
  "likes_to_chase",
  "likes_wrestling",
  "gentle_play",
  "fetch",
  "mostly_walking_together",
  "prefers_people_to_dogs",
  "learning_social_skills",
] as const;

export const COMPATIBLE_WITH_VALUES = [
  "small_dogs",
  "medium_dogs",
  "large_dogs",
  "puppies",
  "adult_dogs",
  "senior_dogs",
  "calm_dogs",
  "high_energy_dogs",
  "male_dogs",
  "female_dogs",
  "most_dogs",
  "depends_on_the_dog",
] as const;

export const NOT_GOOD_FIT_WITH_VALUES = [
  "small_dogs",
  "large_dogs",
  "puppies",
  "high_energy_dogs",
  "male_dogs",
  "female_dogs",
  "rough_play",
  "no_major_restrictions",
] as const;

export const AVAILABILITY_VALUES = [
  "morning",
  "midday",
  "afternoon",
  "evening",
  "weekdays",
  "weekends",
] as const;

export const MEETUP_VALUES = [
  "neighborhood_walk",
  "park_walk",
  "dog_park",
  "trail_hike",
  "patio_social",
] as const;

export const SITTING_VALUES = [
  "a_few_hours",
  "half_day",
  "full_day",
  "overnight",
  "trade_sitting_favors",
  "paid_sitting_referrals",
] as const;

type Profile = {
  size?: unknown;
  age?: unknown;
  dogSex?: unknown;
  temperament?: unknown;
  energyLevel?: unknown;
  playStyles?: unknown;
  lookingFor?: unknown;
  compatibleWith?: unknown;
  notGoodFitWith?: unknown;
  availability?: unknown;
  distanceMiles?: unknown;
};

export type RankedDog<T> = T & { matchExplanation: string | null };

const asStrings = (value: unknown, allowed?: ReadonlySet<string>): string[] =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .filter((entry) => !allowed || allowed.has(entry))
    : [];

const lower = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const canonicalSize = (value: unknown): string => {
  const normalized = lower(value);
  if (normalized === "extra large" || normalized === "extra_large") return "large";
  if (normalized === "small" || normalized === "medium" || normalized === "large") {
    return normalized;
  }
  return "";
};

const canonicalEnergy = (value: unknown): string => {
  const normalized = lower(value);
  return normalized === "low" || normalized === "medium" || normalized === "high"
    ? normalized
    : "";
};

const isCareIntent = (value: string): boolean =>
  value === "dog_sitting_swap" || value === "occasional_dropoff_help";

const displayIntent = (value: string): string => {
  const labels: Record<string, string> = {
    dog_walk: "dog walks",
    playdate: "playdates",
    park_meetup: "park meetups",
    dog_friendly_date: "dog-friendly dates",
    friendship: "friendship",
    regular_walking_buddy: "regular walks",
    dog_sitting_swap: "dog-sitting swaps",
    occasional_dropoff_help: "drop-off help",
    other: "similar meetups",
  };
  return labels[value] ?? "similar meetups";
};

const displayAvailability = (value: string): string => {
  const labels: Record<string, string> = {
    morning: "mornings",
    midday: "midday",
    afternoon: "afternoons",
    evening: "evenings",
    weekdays: "weekdays",
    weekends: "weekends",
  };
  return labels[value] ?? value;
};

const values = (entries: readonly string[]) => new Set(entries);

export function toDogWritePayload(
  input: Record<string, unknown>,
  userId: string,
  existing?: Record<string, unknown>,
): Record<string, unknown> {
  const has = (key: string) =>
    existing === undefined || Object.prototype.hasOwnProperty.call(input, key);
  const lookingFor = has("lookingFor")
    ? asStrings(input.lookingFor, values(LOOKING_FOR_VALUES))
    : asStrings(existing?.looking_for, values(LOOKING_FOR_VALUES));
  const payload: Record<string, unknown> = {
    ...(existing === undefined ? { user_id: userId } : {}),
    ...(has("name") ? { name: String(input.name ?? "").trim() } : {}),
  };
  if (has("description")) {
    payload.description =
      typeof input.description === "string" && input.description.trim()
        ? input.description
        : null;
  }
  if (has("photoUrl")) {
    payload.photo_url =
      typeof input.photoUrl === "string" && input.photoUrl.trim()
        ? input.photoUrl
        : null;
  }
  if (has("dogSex")) {
    payload.dog_sex =
      input.dogSex === "male" || input.dogSex === "female" || input.dogSex === "unknown"
        ? input.dogSex
        : null;
  }
  if (has("size")) payload.size = input.size ?? null;
  if (has("temperament")) payload.temperament = asStrings(input.temperament);
  if (has("lookingFor")) payload.looking_for = lookingFor;
  if (has("lookingForNote")) {
    payload.looking_for_note =
      typeof input.lookingForNote === "string" && input.lookingForNote.trim()
        ? input.lookingForNote
        : null;
  }
  if (has("energyLevel")) payload.energy_level = input.energyLevel ?? null;
  if (has("playStyles")) {
    payload.play_styles = asStrings(input.playStyles, values(PLAY_STYLE_VALUES));
  }
  if (has("compatibleWith")) {
    payload.compatible_with = asStrings(input.compatibleWith, values(COMPATIBLE_WITH_VALUES));
  }
  if (has("notGoodFitWith")) {
    payload.not_good_fit_with = asStrings(input.notGoodFitWith, values(NOT_GOOD_FIT_WITH_VALUES));
  }
  if (has("availability")) {
    payload.availability = asStrings(input.availability, values(AVAILABILITY_VALUES));
  }
  if (has("meetupPreferences")) {
    payload.meetup_preferences = asStrings(input.meetupPreferences, values(MEETUP_VALUES));
  }
  if (has("sittingInterests") || has("lookingFor")) {
    const careSelected = lookingFor.some(
      (intent) => intent === "dog_sitting_swap" || intent === "occasional_dropoff_help",
    );
    payload.sitting_interests = careSelected
      ? asStrings(input.sittingInterests, values(SITTING_VALUES))
      : [];
  }
  return payload;
}

const dogAttributes = (profile: Profile): Set<string> => {
  const attributes = new Set<string>();
  const size = canonicalSize(profile.size);
  if (size) attributes.add(`${size}_dogs`);

  const age = lower(profile.age);
  if (age.includes("puppy")) attributes.add("puppies");
  if (age.includes("senior")) attributes.add("senior_dogs");
  if (age && !age.includes("puppy") && !age.includes("senior")) {
    attributes.add("adult_dogs");
  }

  const energy = canonicalEnergy(profile.energyLevel);
  if (energy === "high") attributes.add("high_energy_dogs");
  if (energy === "low") attributes.add("calm_dogs");

  const sex = lower(profile.dogSex);
  if (sex === "male" || sex === "female") attributes.add(`${sex}_dogs`);

  if (asStrings(profile.playStyles).includes("likes_wrestling")) {
    attributes.add("rough_play");
  }

  for (const trait of asStrings(profile.temperament).map(lower)) {
    if (trait === "calm") attributes.add("calm_dogs");
    if (trait === "energetic" || trait === "excitable") {
      attributes.add("high_energy_dogs");
    }
  }
  return attributes;
};

function oneWayCompatibility(candidate: Profile, other: Profile): {
  explicit: boolean;
  blocked: boolean;
} {
  const compatible = new Set(asStrings(candidate.compatibleWith));
  const restrictions = new Set(asStrings(candidate.notGoodFitWith));
  const otherAttributes = dogAttributes(other);
  const hasPositivePreferences =
    compatible.size > 0 &&
    !compatible.has("most_dogs") &&
    !compatible.has("depends_on_the_dog");
  const blocked = [...restrictions].some(
    (restriction) =>
      restriction !== "no_major_restrictions" && otherAttributes.has(restriction),
  );
  if (blocked) return { explicit: true, blocked: true };
  if (!hasPositivePreferences) {
    return { explicit: compatible.size > 0 || restrictions.size > 0, blocked: false };
  }
  return {
    explicit: true,
    blocked: false,
  };
}

export function dogsAreCompatible(left: Profile, right: Profile): boolean {
  const leftDirection = oneWayCompatibility(left, right);
  const rightDirection = oneWayCompatibility(right, left);
  if (leftDirection.blocked || rightDirection.blocked) return false;
  const leftPositive = new Set(asStrings(left.compatibleWith));
  const rightPositive = new Set(asStrings(right.compatibleWith));
  const leftMatches =
    leftPositive.has("most_dogs") ||
    leftPositive.has("depends_on_the_dog") ||
    [...leftPositive].some((entry) => dogAttributes(right).has(entry));
  const rightMatches =
    rightPositive.has("most_dogs") ||
    rightPositive.has("depends_on_the_dog") ||
    [...rightPositive].some((entry) => dogAttributes(left).has(entry));
  const leftHasRestrictions = [...asStrings(left.notGoodFitWith)].some(
    (entry) => entry !== "no_major_restrictions",
  );
  const rightHasRestrictions = [...asStrings(right.notGoodFitWith)].some(
    (entry) => entry !== "no_major_restrictions",
  );
  return (
    (leftDirection.explicit || rightDirection.explicit) &&
    (leftMatches ||
      rightMatches ||
      (leftPositive.size === 0 &&
        rightPositive.size === 0 &&
        !leftHasRestrictions &&
        !rightHasRestrictions))
  );
}

function hasSharedValues(left: unknown, right: unknown): boolean {
  const rightValues = new Set(asStrings(right));
  return asStrings(left).some((value) => rightValues.has(value));
}

function distanceValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getMatchExplanation(own: Profile, candidate: Profile): string | null {
  const sharedIntents = asStrings(own.lookingFor).filter((intent) =>
    asStrings(candidate.lookingFor).includes(intent),
  );
  const sharedAvailability = asStrings(own.availability).filter((time) =>
    asStrings(candidate.availability).includes(time),
  );
  const nearby = distanceValue(candidate.distanceMiles) !== null;
  const compatible = dogsAreCompatible(own, candidate);
  const careIntent = sharedIntents.find(isCareIntent);
  if (nearby && sharedAvailability.length > 0) {
    return `Nearby + both available ${displayAvailability(sharedAvailability[0])}`;
  }
  if (nearby && sharedIntents.length > 0) {
    return `Nearby + both looking for ${displayIntent(sharedIntents[0])}`;
  }
  if (careIntent) {
    return `Both interested in ${displayIntent(careIntent)}`;
  }
  if (sharedIntents.includes("playdate")) return "Good fit for playdates";
  if (sharedIntents.length > 0) {
    return `Both looking for ${displayIntent(sharedIntents[0])}`;
  }
  if (compatible) return "Good fit for dog meetups";
  if (nearby) return "Nearby";
  return null;
}

export function rankDogs<T extends Profile>(dogs: T[], own: Profile | null): RankedDog<T>[] {
  if (!own) {
    return dogs.map((dog) => ({ ...dog, matchExplanation: null }));
  }

  return dogs
    .map((dog, index) => ({
      dog,
      index,
      sharedIntent: hasSharedValues(own.lookingFor, dog.lookingFor),
      compatible: dogsAreCompatible(own, dog),
      sharedAvailability: hasSharedValues(own.availability, dog.availability),
      distance: distanceValue(dog.distanceMiles),
    }))
    .sort((left, right) => {
      if (left.distance !== null || right.distance !== null) {
        if (left.distance === null) return 1;
        if (right.distance === null) return -1;
        if (left.distance !== right.distance) return left.distance - right.distance;
      }
      if (left.sharedIntent !== right.sharedIntent) return left.sharedIntent ? -1 : 1;
      if (left.compatible !== right.compatible) return left.compatible ? -1 : 1;
      if (left.sharedAvailability !== right.sharedAvailability) {
        return left.sharedAvailability ? -1 : 1;
      }
      return left.index - right.index;
    })
    .map(({ dog }) => ({
      ...dog,
      matchExplanation: getMatchExplanation(own, dog),
    }));
}