import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  AddDogToPackParams,
  AddDogToPackResponse,
  CreateLocalParkPackBody,
  CreateLocalParkPackResponse,
  CreateParkPackPostBody,
  CreateParkPackPostResponse,
  CreateDogBody,
  CreateDogResponse,
  DeleteParkPackPostParams,
  GetParkPackDetailParams,
  GetParkPackDetailResponse,
  GetMyDogResponse,
  UpdateMyDogBody,
  UpdateMyDogResponse,
  ListDogsQueryParams,
  ListDogsResponse,
  ListIncomingPackRequestsResponse,
  ListPacksResponse,
  ListParksResponse,
  UpdateParkPackMembershipBody,
  UpdateParkPackMembershipParams,
  UpdateParkPackMembershipResponse,
  UpdateDogLocationBody,
  UpdateDogLocationResponse,
  RespondToPackRequestBody,
  RespondToPackRequestParams,
  RespondToPackRequestResponse,
} from "@workspace/api-zod";
import {
  readProviderError,
  supabaseRequest,
  supabaseUserRequest,
} from "../lib/connectors";
import { getAccessToken } from "../lib/session-auth";
import { rankDogs, toDogWritePayload } from "../lib/dog-profile";
import {
  canViewPrivateParkPack,
  isPackMembershipUniqueConflict,
  normalizeParkPackPostBody,
  serializeParkPackMember,
  serializeParkPackPost,
} from "../lib/park-pack";

const router: IRouter = Router();

type RecordValue = Record<string, unknown>;

const LOOKING_FOR_VALUES = new Set([
  "dog_walk",
  "playdate",
  "park_meetup",
  "dog_friendly_date",
  "friendship",
  "regular_walking_buddy",
  "dog_sitting_swap",
  "occasional_dropoff_help",
  "other",
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
const COMPATIBLE_WITH_VALUES = new Set([
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
const NOT_GOOD_FIT_WITH_VALUES = new Set([
  "small_dogs",
  "large_dogs",
  "puppies",
  "high_energy_dogs",
  "male_dogs",
  "female_dogs",
  "rough_play",
  "no_major_restrictions",
]);
const AVAILABILITY_VALUES = new Set([
  "morning",
  "midday",
  "afternoon",
  "evening",
  "weekdays",
  "weekends",
]);
const MEETUP_VALUES = new Set([
  "neighborhood_walk",
  "park_walk",
  "dog_park",
  "trail_hike",
  "patio_social",
]);
const SITTING_VALUES = new Set([
  "a_few_hours",
  "half_day",
  "full_day",
  "overnight",
  "trade_sitting_favors",
  "paid_sitting_referrals",
]);

function stringArray(value: unknown, allowed?: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .filter((entry) => !allowed || allowed.has(entry));
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function profileSize(value: unknown): "Small" | "Medium" | "Large" | "Extra large" | null {
  if (value === "Small" || value === "Medium" || value === "Large" || value === "Extra large") {
    return value;
  }
  if (value === "small") return "Small";
  if (value === "medium") return "Medium";
  if (value === "large") return "Large";
  if (value === "extra_large" || value === "extra large") return "Extra large";
  return null;
}

function energyLevel(value: unknown): "low" | "medium" | "high" | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function dogSex(value: unknown): "male" | "female" | "unknown" | null {
  return value === "male" || value === "female" || value === "unknown" ? value : null;
}

function profileFields(row: RecordValue): Record<string, unknown> {
  return {
    size: row.size,
    age: row.age,
    temperament: stringArray(row.temperament),
    dogSex: row.dog_sex,
    energyLevel: row.energy_level,
    lookingFor: stringArray(row.looking_for, LOOKING_FOR_VALUES),
    playStyles: stringArray(row.play_styles, PLAY_STYLE_VALUES),
    compatibleWith: stringArray(row.compatible_with, COMPATIBLE_WITH_VALUES),
    notGoodFitWith: stringArray(row.not_good_fit_with, NOT_GOOD_FIT_WITH_VALUES),
    availability: stringArray(row.availability, AVAILABILITY_VALUES),
    distanceMiles: coordinate(row.distance_miles),
  };
}

function serializeDog(
  row: RecordValue,
  ownerId: string,
  ownerName: string | null,
  isInPack: boolean,
  matchExplanation: string | null = null,
): RecordValue {
  return {
    id: String(row.id),
    ownerId,
    name: String(row.name ?? "Neighborhood dog"),
    ownerName,
    description: nullableString(row.description),
    photoUrl: nullableString(row.photo_url),
    dogSex: dogSex(row.dog_sex),
    size: profileSize(row.size),
    temperament: stringArray(row.temperament),
    lookingFor: stringArray(row.looking_for, LOOKING_FOR_VALUES),
    lookingForNote: nullableString(row.looking_for_note),
    energyLevel: energyLevel(row.energy_level),
    playStyles: stringArray(row.play_styles, PLAY_STYLE_VALUES),
    compatibleWith: stringArray(row.compatible_with, COMPATIBLE_WITH_VALUES),
    notGoodFitWith: stringArray(row.not_good_fit_with, NOT_GOOD_FIT_WITH_VALUES),
    availability: stringArray(row.availability, AVAILABILITY_VALUES),
    meetupPreferences: stringArray(row.meetup_preferences, MEETUP_VALUES),
    sittingInterests: stringArray(row.sitting_interests, SITTING_VALUES),
    parkId: null,
    isInPack,
    distanceMiles: coordinate(row.distance_miles),
    matchExplanation,
  };
}

function bearer(req: Parameters<typeof getAccessToken>[0]): Record<string, string> {
  const token = getAccessToken(req);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function coordinate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

async function jsonRows(
  path: string,
  headers: Record<string, string> = {},
): Promise<RecordValue[]> {
  const request = headers.Authorization ? supabaseUserRequest : supabaseRequest;
  const response = await request(path, { headers });
  if (!response.ok) {
    throw new Error(await readProviderError(response));
  }
  return (await response.json()) as RecordValue[];
}

async function rpcRows(
  functionName: string,
  headers: Record<string, string> = {},
  body: Record<string, unknown> = {},
): Promise<RecordValue[]> {
  const request = headers.Authorization ? supabaseUserRequest : supabaseRequest;
  const response = await request(`/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await readProviderError(response));
  }
  return (await response.json()) as RecordValue[];
}

router.get("/dogs", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const parsed = ListDogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid dog filters." });
    return;
  }

  try {
    const authHeaders = bearer(req);
    const currentUserResponse = authHeaders.Authorization
      ? await supabaseUserRequest("/auth/v1/user", { headers: authHeaders })
      : null;
    const currentUser = currentUserResponse?.ok
      ? ((await currentUserResponse.json()) as { id?: unknown })
      : null;
    const currentUserId = typeof currentUser?.id === "string" ? currentUser.id : null;
    if (parsed.data.nearby && !currentUserId) {
      res.status(401).json({ error: "Sign in to find dogs near you." });
      return;
    }
    const [dogs, profiles, familiarRows] = await Promise.all([
      rpcRows("get_dogs_for_matching_v2", authHeaders),
      jsonRows("/rest/v1/profiles?select=id,full_name", authHeaders),
      jsonRows(
        "/rest/v1/dog_familiars?select=marked_dog_id",
        authHeaders,
      ),
    ]);

    const profileNames = new Map(
      profiles.map((profile) => [
        String(profile.id),
        typeof profile.full_name === "string" ? profile.full_name : null,
      ]),
    );
    const familiarDogIds = new Set(
      currentUserId
        ? familiarRows.map((row) => String(row.marked_dog_id))
        : [],
    );

    const ownDogs = currentUserId
      ? await jsonRows(
          `/rest/v1/dogs?select=*&user_id=eq.${encodeURIComponent(currentUserId)}&order=updated_at.desc,created_at.desc&limit=1`,
          authHeaders,
        )
      : [];
    const ownDog = ownDogs[0] ?? null;
    if (parsed.data.nearby && currentUserId) {
      const latitude = coordinate(ownDog?.latitude);
      const longitude = coordinate(ownDog?.longitude);
      if (latitude === null || longitude === null) {
        res.status(409).json({ error: "Turn on nearby discovery before searching by distance." });
        return;
      }
    }
    const radius = parsed.data.radiusMiles ?? 2;
    const rankedInput = dogs.map((dog) => ({
      ...profileFields(dog),
      id: String(dog.id),
      ownerId: String(dog.user_id),
      name: String(dog.name ?? "Neighborhood dog"),
      ownerName:
        (typeof dog.owner_name === "string" ? dog.owner_name : null) ??
        (typeof dog.owner_full_name === "string" ? dog.owner_full_name : null) ??
        profileNames.get(String(dog.user_id)) ??
        null,
      description: nullableString(dog.description),
      photoUrl: nullableString(dog.photo_url),
      dogSex: dogSex(dog.dog_sex),
      size: profileSize(dog.size),
      lookingForNote: nullableString(dog.looking_for_note),
      playStyles: stringArray(dog.play_styles, PLAY_STYLE_VALUES),
      meetupPreferences: stringArray(dog.meetup_preferences, MEETUP_VALUES),
      sittingInterests: stringArray(dog.sitting_interests, SITTING_VALUES),
      isInPack: familiarDogIds.has(String(dog.id)),
      parkId: null,
    }));
    const ownProfile = ownDog ? profileFields(ownDog) : null;
    const ranked = rankDogs(rankedInput, ownProfile) as Array<
      RecordValue & { matchExplanation: string | null }
    >;
    const result = ranked
      .filter((dog) => {
        if (!parsed.data.nearby) return true;
        const distance = coordinate(dog.distanceMiles);
        return distance !== null && distance <= radius;
      })
      .map(({ matchExplanation, ...dog }) => ({
        ...dog,
        temperament: stringArray(dog.temperament),
        lookingFor: stringArray(dog.lookingFor, LOOKING_FOR_VALUES),
        compatibleWith: stringArray(dog.compatibleWith, COMPATIBLE_WITH_VALUES),
        notGoodFitWith: stringArray(dog.notGoodFitWith, NOT_GOOD_FIT_WITH_VALUES),
        availability: stringArray(dog.availability, AVAILABILITY_VALUES),
        energyLevel: energyLevel(dog.energyLevel),
        dogSex: dogSex(dog.dogSex),
        distanceMiles: coordinate(dog.distanceMiles),
        matchExplanation,
      }));
    res.json(ListDogsResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "Unable to list dogs");
    res.status(502).json({ error: "Unable to load nearby dogs right now." });
  }
});

router.post("/dogs", async (req, res) => {
  const parsed = CreateDogBody.safeParse(req.body);
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: "Sign in before adding your dog." });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: "Please check the dog profile fields." });
    return;
  }

  const userResponse = await supabaseUserRequest("/auth/v1/user", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) {
    res.status(401).json({ error: "Your session has expired." });
    return;
  }
  const user = (await userResponse.json()) as { id: string };
  const payload = toDogWritePayload(
    parsed.data as Record<string, unknown>,
    user.id,
  );
  const response = await supabaseUserRequest("/rest/v1/dogs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    res.status(response.status).json({ error: await readProviderError(response) });
    return;
  }
  const rows = (await response.json()) as RecordValue[];
  const dog = rows[0] ?? { id: randomUUID(), ...payload };
  res.status(201).json(
    CreateDogResponse.parse(serializeDog(dog, user.id, null, false)),
  );
});

router.get("/dogs/mine", async (req, res) => {
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: "Sign in to view your dog." });
    return;
  }

  const userResponse = await supabaseUserRequest("/auth/v1/user", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) {
    res.status(401).json({ error: "Your session has expired." });
    return;
  }

  const user = (await userResponse.json()) as {
    id: string;
    user_metadata?: { full_name?: string; name?: string };
  };
  const dogs = await jsonRows(
    `/rest/v1/dogs?select=*&user_id=eq.${encodeURIComponent(user.id)}&order=updated_at.desc&limit=1`,
    { Authorization: `Bearer ${token}` },
  );
  const dog = dogs[0];
  if (!dog) {
    res.status(404).json({ error: "Add your dog to get started." });
    return;
  }

  res.json(
    GetMyDogResponse.parse(
      serializeDog(
        dog,
        user.id,
        user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
        false,
      ),
    ),
  );
});

router.put("/dogs/mine", async (req, res) => {
  const parsed = UpdateMyDogBody.safeParse(req.body);
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: "Sign in before updating your dog." });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: "Please check the dog profile fields." });
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };
  const userResponse = await supabaseUserRequest("/auth/v1/user", {
    headers: authHeaders,
  });
  if (!userResponse.ok) {
    res.status(401).json({ error: "Your session has expired." });
    return;
  }
  const user = (await userResponse.json()) as {
    id: string;
    user_metadata?: { full_name?: string; name?: string };
  };
  const existingRows = await jsonRows(
    `/rest/v1/dogs?select=*&user_id=eq.${encodeURIComponent(user.id)}&order=updated_at.desc,created_at.desc&limit=1`,
    authHeaders,
  );
  const existing = existingRows[0];
  if (!existing) {
    res.status(404).json({ error: "Add your dog before editing its profile." });
    return;
  }

  const payload = toDogWritePayload(
    parsed.data as Record<string, unknown>,
    user.id,
    existing,
  );
  const response = await supabaseUserRequest(
    `/rest/v1/dogs?id=eq.${encodeURIComponent(String(existing.id))}&user_id=eq.${encodeURIComponent(user.id)}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) {
    res.status(response.status).json({ error: await readProviderError(response) });
    return;
  }
  const updatedRows = (await response.json()) as RecordValue[];
  const updated = updatedRows[0] ?? { ...existing, ...payload };
  res.json(
    UpdateMyDogResponse.parse(
      serializeDog(
        updated,
        user.id,
        user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
        false,
      ),
    ),
  );
});

router.put("/dogs/location", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const parsed = UpdateDogLocationBody.safeParse(req.body);
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: "Sign in to manage nearby discovery." });
    return;
  }
  if (!parsed.success || (parsed.data.enabled && (parsed.data.latitude === undefined || parsed.data.longitude === undefined))) {
    res.status(400).json({ error: "A valid device location is required to turn on nearby discovery." });
    return;
  }
  const authHeaders = { Authorization: `Bearer ${token}` };
  const userResponse = await supabaseUserRequest("/auth/v1/user", { headers: authHeaders });
  if (!userResponse.ok) {
    res.status(401).json({ error: "Your session has expired." });
    return;
  }
  const user = (await userResponse.json()) as { id: string };
  const dogs = await jsonRows(
    `/rest/v1/dogs?select=id&user_id=eq.${encodeURIComponent(user.id)}&order=updated_at.desc&limit=1`,
    authHeaders,
  );
  const dog = dogs[0];
  if (!dog) {
    res.status(404).json({ error: "Add your dog before turning on nearby discovery." });
    return;
  }
  const response = await supabaseUserRequest(
    `/rest/v1/dogs?id=eq.${encodeURIComponent(String(dog.id))}&user_id=eq.${encodeURIComponent(user.id)}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        latitude: parsed.data.enabled ? parsed.data.latitude : null,
        longitude: parsed.data.enabled ? parsed.data.longitude : null,
      }),
    },
  );
  if (!response.ok) {
    res.status(response.status).json({ error: await readProviderError(response) });
    return;
  }
  res.json(UpdateDogLocationResponse.parse({ enabled: parsed.data.enabled }));
});

router.post("/dogs/:dogId/pack", async (req, res) => {
  const params = AddDogToPackParams.safeParse(req.params);
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: "Sign in before building your pack." });
    return;
  }
  if (!params.success) {
    res.status(400).json({ error: "Invalid dog." });
    return;
  }

  const userResponse = await supabaseUserRequest("/auth/v1/user", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) {
    res.status(401).json({ error: "Your session has expired." });
    return;
  }
  const user = (await userResponse.json()) as { id: string };
  const myDogs = await jsonRows(
    `/rest/v1/dogs?select=id&user_id=eq.${encodeURIComponent(user.id)}&order=updated_at.desc&limit=1`,
    { Authorization: `Bearer ${token}` },
  );
  const myDog = myDogs[0];
  if (!myDog) {
    res.status(409).json({ error: "Add your own dog before expressing interest." });
    return;
  }

  const response = await supabaseUserRequest("/rest/v1/rpc/send_pack_request", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      my_dog_id: myDog.id,
      their_dog_id: params.data.dogId,
      request_message: null,
    }),
  });
  if (!response.ok) {
    res.status(response.status).json({ error: await readProviderError(response) });
    return;
  }
  const requestResult = (await response.json()) as
    | string
    | RecordValue
    | RecordValue[]
    | null;
  const requestRecord = Array.isArray(requestResult)
    ? requestResult[0]
    : typeof requestResult === "object" && requestResult
      ? requestResult
      : {};
  res.status(201).json(
    AddDogToPackResponse.parse({
      id: String(
        typeof requestResult === "string"
          ? requestResult
          : requestRecord.id ?? requestRecord.request_id ?? randomUUID(),
      ),
      dogId: params.data.dogId,
      status: "pending",
    }),
  );
});

router.get("/pack-requests/incoming", async (req, res) => {
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: "Sign in to view match interests." });
    return;
  }

  const response = await supabaseUserRequest(
    "/rest/v1/rpc/get_incoming_pack_requests",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );
  if (!response.ok) {
    res.status(response.status).json({ error: await readProviderError(response) });
    return;
  }

  const rows = (await response.json()) as RecordValue[];
  res.json(
    ListIncomingPackRequestsResponse.parse(
      rows.map((row) => ({
        id: String(row.id),
        fromDogName: String(row.from_dog_name ?? "A neighborhood dog"),
        toDogName: String(row.to_dog_name ?? "your dog"),
        message: typeof row.message === "string" ? row.message : null,
        createdAt:
          typeof row.created_at === "string"
            ? row.created_at
            : new Date().toISOString(),
      })),
    ),
  );
});

router.post("/pack-requests/:requestId/response", async (req, res) => {
  const token = getAccessToken(req);
  const params = RespondToPackRequestParams.safeParse(req.params);
  const body = RespondToPackRequestBody.safeParse(req.body);
  if (!token) {
    res.status(401).json({ error: "Sign in to respond to match interests." });
    return;
  }
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose accept or decline." });
    return;
  }

  const response = await supabaseUserRequest(
    "/rest/v1/rpc/respond_to_pack_request",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        request_id: params.data.requestId,
        new_status: body.data.status,
      }),
    },
  );
  if (!response.ok) {
    res.status(response.status).json({ error: await readProviderError(response) });
    return;
  }

  res.json(
    RespondToPackRequestResponse.parse({
      success: true,
      status: body.data.status,
    }),
  );
});

router.get("/parks", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const authHeaders = bearer(req);
    const currentUserResponse = authHeaders.Authorization
      ? await supabaseUserRequest("/auth/v1/user", { headers: authHeaders })
      : null;
    const currentUser = currentUserResponse?.ok
      ? ((await currentUserResponse.json()) as { id?: unknown })
      : null;
    const currentUserId =
      typeof currentUser?.id === "string" ? currentUser.id : null;
    const [parks, packs, memberships] = await Promise.all([
      jsonRows("/rest/v1/parks?select=*&order=name.asc&limit=50"),
      jsonRows(
        "/rest/v1/packs?select=id,name,location,is_public,tags,creator_id&is_public=eq.true",
      ),
      jsonRows("/rest/v1/pack_members?select=pack_id,user_id", authHeaders),
    ]);
    const publicPacks = new Map(
      packs.map((pack) => [String(pack.id), pack]),
    );
    const result = parks.map((park) => {
      const pack = publicPacks.get(String(park.id));
      const tags = Array.isArray(pack?.tags) ? pack.tags.map(String) : [];
      return {
        id: String(park.id),
        name: String(park.name),
        city: String(park.city),
        state: String(park.state),
        slug: String(park.slug),
        address: typeof pack?.location === "string" ? pack.location : null,
        offLeash: tags.includes("off-leash"),
        communityCreated: tags.includes("community-created"),
        memberCount: memberships.filter(
          (membership) => String(membership.pack_id) === String(park.id),
        ).length,
        isMember:
          Boolean(pack) &&
          memberships.some(
            (membership) =>
              String(membership.pack_id) === String(park.id) &&
              String(membership.user_id) === currentUserId,
          ),
        isCreator:
          Boolean(pack) &&
          currentUserId !== null &&
          String(pack?.creator_id) === currentUserId,
      };
    });
    res.json(ListParksResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "Unable to list parks");
    res.status(502).json({ error: "Unable to load parks right now." });
  }
});

router.get("/parks/:parkId", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const params = GetParkPackDetailParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid park pack." });
    return;
  }

  try {
    const parkId = params.data.parkId;
    const [parks, packs, memberships] = await Promise.all([
      jsonRows(
        `/rest/v1/parks?select=id,name,city,state,slug,description&id=eq.${encodeURIComponent(parkId)}&limit=1`,
      ),
      jsonRows(
        `/rest/v1/packs?select=id,name,location,description,is_public,tags,creator_id&id=eq.${encodeURIComponent(parkId)}&is_public=eq.true&limit=1`,
      ),
      jsonRows("/rest/v1/pack_members?select=pack_id"),
    ]);
    const park = parks[0];
    const pack = packs[0];
    if (!park || !pack) {
      res.status(404).json({ error: "Local park pack not found." });
      return;
    }

    const tags = Array.isArray(pack.tags) ? pack.tags.map(String) : [];
    const authHeaders = bearer(req);
    let currentUserId: string | null = null;
    let hasMembership = false;

    if (authHeaders.Authorization) {
      const userResponse = await supabaseUserRequest("/auth/v1/user", {
        headers: authHeaders,
      });
      if (userResponse.ok) {
        const user = (await userResponse.json()) as { id?: unknown };
        currentUserId = typeof user.id === "string" ? user.id : null;
      }
      if (currentUserId) {
        const ownMembership = await jsonRows(
          `/rest/v1/pack_members?select=id&pack_id=eq.${encodeURIComponent(parkId)}&user_id=eq.${encodeURIComponent(currentUserId)}&limit=1`,
          authHeaders,
        );
        hasMembership = ownMembership.length > 0;
      }
    }

    const isCreator =
      currentUserId !== null && String(pack.creator_id) === currentUserId;
    const isMember = canViewPrivateParkPack(
      currentUserId,
      isCreator,
      hasMembership,
    );
    const memberDogs = isMember
      ? await rpcRows("get_pack_member_dogs_safe", authHeaders, {
          target_pack_id: parkId,
        })
      : [];
    const postRows = isMember
      ? await rpcRows("get_pack_posts_with_authors", authHeaders, {
          target_pack_id: parkId,
        })
      : [];

    res.json(
      GetParkPackDetailResponse.parse({
        id: parkId,
        name: String(park.name),
        city: String(park.city ?? "Austin"),
        state: String(park.state ?? "TX"),
        slug: String(park.slug),
        address: typeof pack.location === "string" ? pack.location : null,
        description:
          typeof park.description === "string"
            ? park.description
            : typeof pack.description === "string"
              ? pack.description
              : null,
        offLeash: tags.includes("off-leash"),
        communityCreated: tags.includes("community-created"),
        memberCount: memberships.filter(
          (membership) => String(membership.pack_id) === parkId,
        ).length,
        isMember,
        isCreator,
        members: isMember
          ? memberDogs.map((member) => serializeParkPackMember(member))
          : null,
        posts: isMember
          ? postRows.map((post) =>
              serializeParkPackPost(post, memberDogs, currentUserId ?? ""),
            )
          : null,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Unable to load park pack detail");
    res.status(502).json({ error: "Unable to load this park pack right now." });
  }
});

router.post("/parks/:parkId/posts", async (req, res) => {
  const body = CreateParkPackPostBody.safeParse(normalizeParkPackPostBody(req.body));
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: "Sign in to post in a park pack." });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: "Keep your park-pack post under 280 characters." });
    return;
  }

  try {
    const parkId = String(req.params.parkId);
    const authHeaders = { Authorization: `Bearer ${token}` };
    const userResponse = await supabaseUserRequest("/auth/v1/user", {
      headers: authHeaders,
    });
    if (!userResponse.ok) {
      res.status(401).json({ error: "Your session has expired." });
      return;
    }
    const user = (await userResponse.json()) as { id: string };
    const [packs, membership] = await Promise.all([
      jsonRows(
        `/rest/v1/packs?select=id,creator_id&id=eq.${encodeURIComponent(parkId)}&is_public=eq.true&limit=1`,
      ),
      jsonRows(
        `/rest/v1/pack_members?select=id&pack_id=eq.${encodeURIComponent(parkId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
        authHeaders,
      ),
    ]);
    if (!packs[0]) {
      res.status(404).json({ error: "Local park pack not found." });
      return;
    }
    const isCreator = String(packs[0].creator_id) === user.id;
    if (membership.length === 0 && !isCreator) {
      res.status(403).json({ error: "Join this park pack before posting." });
      return;
    }

    const postResponse = await supabaseUserRequest("/rest/v1/pack_posts", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        pack_id: parkId,
        author_id: user.id,
        title: "Park pack note",
        content: body.data.content,
        post_type: "general",
      }),
    });
    if (!postResponse.ok) {
      res.status(postResponse.status).json({ error: await readProviderError(postResponse) });
      return;
    }
    const inserted = (await postResponse.json()) as RecordValue[];
    const insertedRow = inserted[0];
    if (!insertedRow) {
      res.status(502).json({ error: "The park-pack post could not be saved." });
      return;
    }

    const memberDogs = await rpcRows("get_pack_member_dogs_safe", authHeaders, {
      target_pack_id: parkId,
    });
    const postRows = await rpcRows("get_pack_posts_with_authors", authHeaders, {
      target_pack_id: parkId,
    });
    const savedRow =
      postRows.find((post) => String(post.id) === String(insertedRow.id)) ??
      {
        ...insertedRow,
        author_display_name: "You",
      };

    res.status(201).json(
      CreateParkPackPostResponse.parse(
        serializeParkPackPost(savedRow, memberDogs, user.id),
      ),
    );
  } catch (error) {
    req.log.error({ err: error }, "Unable to create park pack post");
    res.status(502).json({ error: "Unable to save this park-pack post right now." });
  }
});

router.delete("/parks/:parkId/posts/:postId", async (req, res) => {
  const params = DeleteParkPackPostParams.safeParse(req.params);
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: "Sign in to delete a park-pack post." });
    return;
  }
  if (!params.success) {
    res.status(400).json({ error: "Invalid park-pack post." });
    return;
  }

  try {
    const authHeaders = { Authorization: `Bearer ${token}` };
    const userResponse = await supabaseUserRequest("/auth/v1/user", {
      headers: authHeaders,
    });
    if (!userResponse.ok) {
      res.status(401).json({ error: "Your session has expired." });
      return;
    }
    const user = (await userResponse.json()) as { id: string };
    const response = await supabaseUserRequest(
      `/rest/v1/pack_posts?id=eq.${encodeURIComponent(params.data.postId)}` +
        `&pack_id=eq.${encodeURIComponent(params.data.parkId)}` +
        `&author_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "DELETE",
        headers: {
          ...authHeaders,
          Prefer: "return=representation",
        },
      },
    );
    if (!response.ok) {
      res.status(response.status).json({ error: await readProviderError(response) });
      return;
    }
    const deleted = (await response.json()) as RecordValue[];
    if (deleted.length === 0) {
      res.status(404).json({ error: "Park-pack post not found." });
      return;
    }
    res.status(204).send();
  } catch (error) {
    req.log.error({ err: error }, "Unable to delete park pack post");
    res.status(502).json({ error: "Unable to delete this park-pack post right now." });
  }
});

router.post("/parks", async (req, res) => {
  const body = CreateLocalParkPackBody.safeParse(req.body);
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: "Sign in to start a local park pack." });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: "Check the park name, address, and description." });
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };
  try {
    const userResponse = await supabaseUserRequest("/auth/v1/user", {
      headers: authHeaders,
    });
    if (!userResponse.ok) {
      res.status(401).json({ error: "Your session has expired." });
      return;
    }
    const user = (await userResponse.json()) as { id: string };
    const name = body.data.name.trim();
    const address = body.data.address.trim();
    const description = body.data.description?.trim() || null;
    const [existingParks, existingPacks] = await Promise.all([
      jsonRows("/rest/v1/parks?select=id,name,metro_id&limit=100"),
      jsonRows("/rest/v1/packs?select=id,location&is_public=eq.true&limit=100"),
    ]);
    const normalizedName = name.toLocaleLowerCase();
    const normalizedAddress = address.toLocaleLowerCase();
    const duplicate =
      existingParks.some(
        (park) => String(park.name).trim().toLocaleLowerCase() === normalizedName,
      ) ||
      existingPacks.some(
        (pack) =>
          typeof pack.location === "string" &&
          pack.location.trim().toLocaleLowerCase() === normalizedAddress,
      );
    if (duplicate) {
      res.status(409).json({
        error: "A local park pack already exists for that park or address.",
      });
      return;
    }
    const metroId = existingParks.find(
      (park) => typeof park.metro_id === "string",
    )?.metro_id;
    if (typeof metroId !== "string") {
      res.status(502).json({ error: "Austin park settings are unavailable." });
      return;
    }

    const id = randomUUID();
    const cleanup = async () => {
      const cleanupRequests = [
        () =>
          supabaseUserRequest(
          `/rest/v1/pack_members?pack_id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
          { method: "DELETE", headers: authHeaders },
        ),
        () =>
          supabaseUserRequest(`/rest/v1/packs?id=eq.${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: authHeaders,
          }),
        () =>
          supabaseUserRequest(`/rest/v1/parks?id=eq.${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: authHeaders,
          }),
      ];
      for (const cleanupRequest of cleanupRequests) {
        try {
          await cleanupRequest();
        } catch {
          // Preserve the original provider error returned to the member.
        }
      }
    };

    const parkResponse = await supabaseUserRequest("/rest/v1/parks", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id,
        name,
        city: "Austin",
        state: "TX",
        slug: `${slugify(name)}-${id.slice(0, 8)}`,
        description:
          description ??
          "A community-created local park pack for Austin dogs and their people.",
        metro_id: metroId,
        created_by: user.id,
      }),
    });
    if (!parkResponse.ok) {
      res.status(parkResponse.status).json({
        error: await readProviderError(parkResponse),
      });
      return;
    }

    const packResponse = await supabaseUserRequest("/rest/v1/packs", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id,
        creator_id: user.id,
        name: `${name} Pack`,
        location: address,
        description:
          description ??
          `A community-created local dog group that meets around ${name}.`,
        is_public: true,
        join_method: "auto_approve",
        discoverability: "public",
        preview_level: "badges_counts",
        max_members: 50,
        show_human_names: true,
        hide_events_until_joined: true,
        tags: ["community-created"],
      }),
    });
    if (!packResponse.ok) {
      await cleanup();
      res.status(packResponse.status).json({
        error: await readProviderError(packResponse),
      });
      return;
    }

    const membershipResponse = await supabaseUserRequest(
      "/rest/v1/pack_members",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ pack_id: id, user_id: user.id }),
      },
    );
    if (!membershipResponse.ok) {
      await cleanup();
      res.status(membershipResponse.status).json({
        error: await readProviderError(membershipResponse),
      });
      return;
    }

    res.status(201).json(
      CreateLocalParkPackResponse.parse({
        id,
        name,
        city: "Austin",
        state: "TX",
        slug: `${slugify(name)}-${id.slice(0, 8)}`,
        address,
        offLeash: false,
        communityCreated: true,
        memberCount: 1,
        isMember: true,
        isCreator: true,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Unable to create local park pack");
    res.status(502).json({ error: "Unable to start this park pack right now." });
  }
});

router.post("/parks/:parkId/membership", async (req, res) => {
  const params = UpdateParkPackMembershipParams.safeParse(req.params);
  const body = UpdateParkPackMembershipBody.safeParse(req.body);
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: "Sign in to join a local park pack." });
    return;
  }
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose whether to join or leave the pack." });
    return;
  }

  try {
    const authHeaders = { Authorization: `Bearer ${token}` };
    const userResponse = await supabaseUserRequest("/auth/v1/user", {
      headers: authHeaders,
    });
    if (!userResponse.ok) {
      res.status(401).json({ error: "Your session has expired." });
      return;
    }
    const user = (await userResponse.json()) as { id: string };
    const parkId = params.data.parkId;
    const [parks, packs] = await Promise.all([
      jsonRows(
        `/rest/v1/parks?select=id&id=eq.${encodeURIComponent(parkId)}&limit=1`,
      ),
      jsonRows(
        `/rest/v1/packs?select=id,creator_id&id=eq.${encodeURIComponent(parkId)}&is_public=eq.true&limit=1`,
      ),
    ]);
    if (!parks[0] || !packs[0]) {
      res.status(404).json({ error: "Local park pack not found." });
      return;
    }

    const membershipPath =
      `/rest/v1/pack_members?pack_id=eq.${encodeURIComponent(parkId)}` +
      `&user_id=eq.${encodeURIComponent(user.id)}`;
    const existing = await jsonRows(
      `${membershipPath}&select=id&limit=1`,
      authHeaders,
    );
    const isCreator = String(packs[0].creator_id) === user.id;
    if (body.data.action === "leave" && isCreator) {
      res.status(409).json({
        error: "Pack creators must remain members. Transfer pack ownership before leaving.",
      });
      return;
    }

    let isMember = existing.length > 0;
    if (body.data.action === "join" && existing.length === 0) {
      const response = await supabaseUserRequest("/rest/v1/pack_members", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ pack_id: parkId, user_id: user.id }),
      });
      if (!response.ok) {
        let providerBody: unknown = null;
        try {
          providerBody = await response.clone().json();
        } catch {
          // Keep the original provider response available for its error text.
        }
        if (
          !isPackMembershipUniqueConflict(response.status, providerBody)
        ) {
          res.status(response.status).json({ error: await readProviderError(response) });
          return;
        }
        const reread = await jsonRows(
          `${membershipPath}&select=id&limit=1`,
          authHeaders,
        );
        if (reread.length === 0) {
          res.status(response.status).json({ error: await readProviderError(response) });
          return;
        }
      }
      isMember = true;
    } else if (body.data.action === "leave" && existing.length > 0) {
      const response = await supabaseUserRequest(membershipPath, {
        method: "DELETE",
        headers: { ...authHeaders, Prefer: "return=minimal" },
      });
      if (!response.ok) {
        res.status(response.status).json({ error: await readProviderError(response) });
        return;
      }
      isMember = false;
    }

    res.json(
      UpdateParkPackMembershipResponse.parse({
        parkId,
        isMember,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Unable to update local park pack membership");
    res.status(502).json({ error: "Unable to update this park pack right now." });
  }
});

router.get("/packs", async (req, res) => {
  try {
    const [packs, memberships] = await Promise.all([
      jsonRows(
        "/rest/v1/packs?select=id,name,location,is_public&is_public=eq.true&order=name.asc&limit=50",
      ),
      jsonRows("/rest/v1/pack_members?select=id,pack_id"),
    ]);
    const result = packs.map((pack) => ({
      id: String(pack.id),
      name: String(pack.name),
      location: typeof pack.location === "string" ? pack.location : null,
      memberCount: memberships.filter((member) => member.pack_id === pack.id)
        .length,
      isPublic: Boolean(pack.is_public),
    }));
    res.json(ListPacksResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "Unable to list packs");
    res.status(502).json({ error: "Unable to load packs right now." });
  }
});

export default router;