export const PROFILE_OPTIONS = {
  lookingFor: [
    { value: "dog_walk", label: "Dog walk" },
    { value: "playdate", label: "Playdate" },
    { value: "park_meetup", label: "Park meetup" },
    { value: "dog_friendly_date", label: "Dog-friendly date" },
    { value: "friendship", label: "Friendship / meet new people" },
    { value: "regular_walking_buddy", label: "Regular walking buddy" },
    { value: "dog_sitting_swap", label: "Dog sitting swap / trade-off" },
    { value: "occasional_dropoff_help", label: "Occasional drop-off help" },
    { value: "other", label: "Other" },
  ],
  temperament: [
    { value: "Friendly", label: "Friendly" },
    { value: "Playful", label: "Playful" },
    { value: "Calm", label: "Calm" },
    { value: "Energetic", label: "Energetic" },
    { value: "Shy", label: "Shy" },
    { value: "Independent", label: "Independent" },
    { value: "Gentle", label: "Gentle" },
    { value: "Protective", label: "Protective" },
    { value: "Excitable", label: "Excitable" },
    { value: "Selective with dogs", label: "Selective with dogs" },
  ],
  energy: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  playStyle: [
    { value: "likes_to_chase", label: "Likes to chase" },
    { value: "likes_wrestling", label: "Likes wrestling" },
    { value: "gentle_play", label: "Gentle play" },
    { value: "fetch", label: "Fetch" },
    { value: "mostly_walking_together", label: "Mostly likes walking together" },
    { value: "prefers_people_to_dogs", label: "Prefers people to dogs" },
    { value: "learning_social_skills", label: "Still learning social skills" },
  ],
  size: [
    { value: "Small", label: "Small" },
    { value: "Medium", label: "Medium" },
    { value: "Large", label: "Large" },
    { value: "Extra large", label: "Extra large" },
  ],
  sex: [
    { value: "male", label: "Male" },
    { value: "female", label: "Female" },
    { value: "unknown", label: "Prefer not to say / unknown" },
  ],
  compatibleWith: [
    { value: "small_dogs", label: "Small dogs" },
    { value: "medium_dogs", label: "Medium dogs" },
    { value: "large_dogs", label: "Large dogs" },
    { value: "puppies", label: "Puppies" },
    { value: "adult_dogs", label: "Adult dogs" },
    { value: "senior_dogs", label: "Senior dogs" },
    { value: "calm_dogs", label: "Calm dogs" },
    { value: "high_energy_dogs", label: "High-energy dogs" },
    { value: "male_dogs", label: "Male dogs" },
    { value: "female_dogs", label: "Female dogs" },
    { value: "most_dogs", label: "Most dogs" },
    { value: "depends_on_the_dog", label: "Depends on the dog" },
  ],
  notGoodFitWith: [
    { value: "small_dogs", label: "Small dogs" },
    { value: "large_dogs", label: "Large dogs" },
    { value: "puppies", label: "Puppies" },
    { value: "high_energy_dogs", label: "High-energy dogs" },
    { value: "male_dogs", label: "Male dogs" },
    { value: "female_dogs", label: "Female dogs" },
    { value: "rough_play", label: "Dogs that play rough" },
    { value: "no_major_restrictions", label: "No major restrictions" },
  ],
  availability: [
    { value: "morning", label: "Morning" },
    { value: "midday", label: "Midday" },
    { value: "afternoon", label: "Afternoon" },
    { value: "evening", label: "Evening" },
    { value: "weekdays", label: "Weekdays" },
    { value: "weekends", label: "Weekends" },
  ],
  meetup: [
    { value: "neighborhood_walk", label: "Neighborhood walk" },
    { value: "park_walk", label: "Park walk" },
    { value: "dog_park", label: "Dog park" },
    { value: "trail_hike", label: "Trail / hike" },
    { value: "patio_social", label: "Patio / dog-friendly social meetup" },
  ],
  sitting: [
    { value: "a_few_hours", label: "Watching another dog for a few hours" },
    { value: "half_day", label: "Half day" },
    { value: "full_day", label: "Full day" },
    { value: "overnight", label: "Overnight" },
    { value: "trade_sitting_favors", label: "Trading dog-sitting favors" },
    { value: "paid_sitting_referrals", label: "Paid pet-sitting referrals" },
  ],
} as const;

export const DOG_CARE_INTENTS = [
  "dog_sitting_swap",
  "occasional_dropoff_help",
] as const;

export function hasDogCareIntent(values: readonly string[]): boolean {
  return values.some((value) => DOG_CARE_INTENTS.includes(value as (typeof DOG_CARE_INTENTS)[number]));
}

export function labelFor(
  group: keyof typeof PROFILE_OPTIONS,
  value: string,
): string {
  const options = PROFILE_OPTIONS[group] as readonly { value: string; label: string }[];
  return options.find((option) => option.value === value)?.label ?? value;
}