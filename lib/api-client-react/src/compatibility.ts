/**
 * Pure, client-safe compatibility details shared by the web and native
 * discovery surfaces. This deliberately describes known profile signals only;
 * it does not produce a score or promise that two dogs will get along.
 */

export type DogCompatibilityProfile = {
  id?: string | null;
  age?: string | null;
  size?: string | null;
  dogSex?: string | null;
  energyLevel?: string | null;
  temperament?: readonly string[] | null;
  playStyles?: readonly string[] | null;
  lookingFor?: readonly string[] | null;
  compatibleWith?: readonly string[] | null;
  notGoodFitWith?: readonly string[] | null;
  availability?: readonly string[] | null;
  meetupPreferences?: readonly string[] | null;
  sittingInterests?: readonly string[] | null;
};

export type CompatibilityDirection = "viewer" | "candidate";

export type CompatibilityPreferenceMatch = {
  direction: CompatibilityDirection;
  value: string;
};

export type CompatibilityRestrictionCaution = {
  direction: CompatibilityDirection;
  value: string;
};

export type DogCompatibilitySummary = {
  sharedMeetupPreferences: string[];
  sharedLookingFor: string[];
  sharedSittingInterests: string[];
  sharedEnergyLevels: string[];
  sharedPlayStyles: string[];
  sharedTraits: string[];
  overlappingAvailability: string[];
  preferenceMatches: CompatibilityPreferenceMatch[];
  genericPreferences: CompatibilityDirection[];
  restrictionCautions: CompatibilityRestrictionCaution[];
  hasKnownSignals: boolean;
};

const COMPATIBLE_VALUES = new Set([
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
]);

const RESTRICTION_VALUES = new Set([
  "small_dogs",
  "large_dogs",
  "puppies",
  "high_energy_dogs",
  "male_dogs",
  "female_dogs",
  "rough_play",
]);

const PLAY_STYLE_VALUES = new Set([
  "likes_to_chase",
  "likes_wrestling",
  "gentle_play",
  "fetch",
  "mostly_walking_together",
  "prefers_people_to_dogs",
  "learning_social_skills",
]);

const strings = (value: readonly string[] | null | undefined): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const lower = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const canonicalSize = (value: unknown): string => {
  const normalized = lower(value);
  if (normalized === "extra large" || normalized === "extra_large") return "large";
  return normalized === "small" || normalized === "medium" || normalized === "large"
    ? normalized
    : "";
};

const canonicalEnergy = (value: unknown): string => {
  const normalized = lower(value);
  return normalized === "low" || normalized === "medium" || normalized === "high"
    ? normalized
    : "";
};

function dogAttributes(profile: DogCompatibilityProfile): Set<string> {
  const attributes = new Set<string>();
  const size = canonicalSize(profile.size);
  if (size) attributes.add(`${size}_dogs`);

  // Keep age normalization aligned with the API matching helper. Unknown age
  // is intentionally not treated as adult.
  const age = lower(profile.age);
  if (age.includes("puppy")) attributes.add("puppies");
  if (age.includes("senior")) attributes.add("senior_dogs");
  if (age && !age.includes("puppy") && !age.includes("senior")) {
    attributes.add("adult_dogs");
  }

  const sex = lower(profile.dogSex);
  if (sex === "male" || sex === "female") attributes.add(`${sex}_dogs`);

  const energy = canonicalEnergy(profile.energyLevel);
  if (energy === "high") attributes.add("high_energy_dogs");

  for (const trait of strings(profile.temperament).map(lower)) {
    if (trait === "calm") attributes.add("calm_dogs");
    if (trait === "energetic" || trait === "excitable") {
      attributes.add("high_energy_dogs");
    }
  }

  if (strings(profile.playStyles).includes("likes_wrestling")) {
    attributes.add("rough_play");
  }

  return attributes;
}

function sharedValues(
  left: readonly string[] | null | undefined,
  right: readonly string[] | null | undefined,
): string[] {
  const rightValues = new Set(strings(right));
  return unique(strings(left).filter((value) => rightValues.has(value)));
}

function sharedTraits(
  left: readonly string[] | null | undefined,
  right: readonly string[] | null | undefined,
): string[] {
  const rightValues = new Set(strings(right).map(lower));
  return unique(strings(left).filter((value) => rightValues.has(lower(value))));
}

function sharedEnergy(
  left: string | null | undefined,
  right: string | null | undefined,
): string[] {
  const leftEnergy = canonicalEnergy(left);
  const rightEnergy = canonicalEnergy(right);
  return leftEnergy && leftEnergy === rightEnergy ? [leftEnergy] : [];
}

function sharedPlayStyles(
  left: readonly string[] | null | undefined,
  right: readonly string[] | null | undefined,
): string[] {
  return sharedValues(left, right).filter((value) => PLAY_STYLE_VALUES.has(value));
}

function matchingPreferences(
  profile: DogCompatibilityProfile,
  other: DogCompatibilityProfile,
  direction: CompatibilityDirection,
): CompatibilityPreferenceMatch[] {
  const attributes = dogAttributes(other);
  return unique(
    strings(profile.compatibleWith).filter(
      (value) => COMPATIBLE_VALUES.has(value) && attributes.has(value),
    ),
  ).map((value) => ({ direction, value }));
}

function matchingRestrictions(
  profile: DogCompatibilityProfile,
  other: DogCompatibilityProfile,
  direction: CompatibilityDirection,
): CompatibilityRestrictionCaution[] {
  const attributes = dogAttributes(other);
  return unique(
    strings(profile.notGoodFitWith).filter(
      (value) => RESTRICTION_VALUES.has(value) && attributes.has(value),
    ),
  ).map((value) => ({ direction, value }));
}

function genericPreference(
  profile: DogCompatibilityProfile,
  other: DogCompatibilityProfile,
  direction: CompatibilityDirection,
): CompatibilityDirection[] {
  const attributes = dogAttributes(other);
  const hasKnownCompatibleAttribute = strings(profile.compatibleWith).some(
    (value) => COMPATIBLE_VALUES.has(value) && attributes.has(value),
  );
  if (
    hasKnownCompatibleAttribute ||
    attributes.size === 0 ||
    !strings(profile.compatibleWith).includes("most_dogs")
  ) {
    return [];
  }
  return [direction];
}

/**
 * Compares a viewer's dog with another dog using only known, explicitly
 * shared profile values. `null` means there is no basis for a personalized
 * comparison (including a signed-out viewer or the viewer's own dog).
 */
export function buildDogCompatibility(
  viewer: DogCompatibilityProfile | null | undefined,
  candidate: DogCompatibilityProfile | null | undefined,
): DogCompatibilitySummary | null {
  if (!viewer || !candidate || viewer === candidate) return null;
  if (viewer.id && candidate.id && viewer.id === candidate.id) return null;

  const sharedMeetupPreferences = sharedValues(
    viewer.meetupPreferences,
    candidate.meetupPreferences,
  );
  const sharedLookingFor = sharedValues(viewer.lookingFor, candidate.lookingFor);
  const sharedSittingInterests = sharedValues(
    viewer.sittingInterests,
    candidate.sittingInterests,
  );
  const sharedEnergyLevels = sharedEnergy(viewer.energyLevel, candidate.energyLevel);
  const sharedPlayStyles = sharedPlayStylesForProfiles(viewer, candidate);
  const sharedTraits = sharedTraitsForProfiles(viewer, candidate);
  const overlappingAvailability = sharedValues(viewer.availability, candidate.availability);
  const preferenceMatches = [
    ...matchingPreferences(viewer, candidate, "viewer"),
    ...matchingPreferences(candidate, viewer, "candidate"),
  ];
  const restrictionCautions = [
    ...matchingRestrictions(viewer, candidate, "viewer"),
    ...matchingRestrictions(candidate, viewer, "candidate"),
  ];

  // A broad "most dogs" preference must never hide a known restriction.
  const genericPreferences =
    restrictionCautions.length > 0
      ? []
      : [
          ...genericPreference(viewer, candidate, "viewer"),
          ...genericPreference(candidate, viewer, "candidate"),
        ];

  const hasKnownSignals =
    sharedMeetupPreferences.length > 0 ||
    sharedLookingFor.length > 0 ||
    sharedSittingInterests.length > 0 ||
    sharedEnergyLevels.length > 0 ||
    sharedPlayStyles.length > 0 ||
    sharedTraits.length > 0 ||
    overlappingAvailability.length > 0 ||
    preferenceMatches.length > 0 ||
    genericPreferences.length > 0 ||
    restrictionCautions.length > 0;

  return {
    sharedMeetupPreferences,
    sharedLookingFor,
    sharedSittingInterests,
    sharedEnergyLevels,
    sharedPlayStyles,
    sharedTraits,
    overlappingAvailability,
    preferenceMatches,
    genericPreferences,
    restrictionCautions,
    hasKnownSignals,
  };
}

function sharedTraitsForProfiles(
  viewer: DogCompatibilityProfile,
  candidate: DogCompatibilityProfile,
): string[] {
  return sharedTraits(viewer.temperament, candidate.temperament);
}

function sharedPlayStylesForProfiles(
  viewer: DogCompatibilityProfile,
  candidate: DogCompatibilityProfile,
): string[] {
  return sharedPlayStyles(viewer.playStyles, candidate.playStyles);
}