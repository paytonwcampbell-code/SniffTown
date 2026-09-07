import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  AddDogToPackParams,
  AddDogToPackResponse,
  CreateDogBody,
  CreateDogResponse,
  ListDogsQueryParams,
  ListDogsResponse,
  ListIncomingPackRequestsResponse,
  ListPacksResponse,
  ListParksResponse,
  UpdateParkPackMembershipBody,
  UpdateParkPackMembershipParams,
  UpdateParkPackMembershipResponse,
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

const router: IRouter = Router();

type RecordValue = Record<string, unknown>;

function bearer(req: Parameters<typeof getAccessToken>[0]): Record<string, string> {
  const token = getAccessToken(req);
  return token ? { Authorization: `Bearer ${token}` } : {};
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
): Promise<RecordValue[]> {
  const request = headers.Authorization ? supabaseUserRequest : supabaseRequest;
  const response = await request(`/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: "{}",
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
    const [dogs, profiles, familiarRows] = await Promise.all([
      rpcRows("get_dogs_for_matching", authHeaders),
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
    const currentUserResponse = authHeaders.Authorization
      ? await supabaseUserRequest("/auth/v1/user", { headers: authHeaders })
      : null;
    const currentUser = currentUserResponse?.ok
      ? ((await currentUserResponse.json()) as { id?: unknown })
      : null;
    const currentUserId = typeof currentUser?.id === "string" ? currentUser.id : null;
    const familiarDogIds = new Set(
      currentUserId
        ? familiarRows.map((row) => String(row.marked_dog_id))
        : [],
    );

    const result = dogs.map((dog) => ({
      id: String(dog.id),
      ownerId: String(dog.user_id),
      name: String(dog.name ?? "Neighborhood dog"),
      ownerName:
        (typeof dog.owner_name === "string" ? dog.owner_name : null) ??
        (typeof dog.owner_full_name === "string" ? dog.owner_full_name : null) ??
        profileNames.get(String(dog.user_id)) ??
        null,
      description:
        typeof dog.description === "string" ? dog.description : null,
      photoUrl: typeof dog.photo_url === "string" ? dog.photo_url : null,
      temperament: Array.isArray(dog.temperament)
        ? dog.temperament.map(String)
        : [],
      parkId: null,
      isInPack: familiarDogIds.has(String(dog.id)),
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
  const payload = {
    user_id: user.id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    photo_url: parsed.data.photoUrl ?? null,
    temperament: parsed.data.temperament ?? [],
  };
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
    CreateDogResponse.parse({
      id: String(dog.id),
      ownerId: user.id,
      name: String(dog.name),
      ownerName: null,
      description:
        typeof dog.description === "string" ? dog.description : null,
      photoUrl: typeof dog.photo_url === "string" ? dog.photo_url : null,
      temperament: Array.isArray(dog.temperament)
        ? dog.temperament.map(String)
        : [],
      parkId: parsed.data.parkId ?? null,
      isInPack: false,
    }),
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
    ListDogsResponse.element.parse({
      id: String(dog.id),
      ownerId: user.id,
      name: String(dog.name ?? "My dog"),
      ownerName:
        user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      description:
        typeof dog.description === "string" ? dog.description : null,
      photoUrl: typeof dog.photo_url === "string" ? dog.photo_url : null,
      temperament: Array.isArray(dog.temperament)
        ? dog.temperament.map(String)
        : [],
      parkId: null,
      isInPack: false,
    }),
  );
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
      jsonRows("/rest/v1/packs?select=id,name,location,is_public&is_public=eq.true"),
      jsonRows("/rest/v1/pack_members?select=pack_id,user_id", authHeaders),
    ]);
    const publicPackIds = new Set(packs.map((pack) => String(pack.id)));
    const result = parks.map((park) => ({
      id: String(park.id),
      name: String(park.name),
      city: String(park.city),
      state: String(park.state),
      slug: String(park.slug),
      memberCount: memberships.filter(
        (membership) => String(membership.pack_id) === String(park.id),
      ).length,
      isMember:
        publicPackIds.has(String(park.id)) &&
        memberships.some(
          (membership) =>
            String(membership.pack_id) === String(park.id) &&
            String(membership.user_id) === currentUserId,
        ),
    }));
    res.json(ListParksResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "Unable to list parks");
    res.status(502).json({ error: "Unable to load parks right now." });
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
        `/rest/v1/packs?select=id&id=eq.${encodeURIComponent(parkId)}&is_public=eq.true&limit=1`,
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
        res.status(response.status).json({ error: await readProviderError(response) });
        return;
      }
    } else if (body.data.action === "leave" && existing.length > 0) {
      const response = await supabaseUserRequest(membershipPath, {
        method: "DELETE",
        headers: { ...authHeaders, Prefer: "return=minimal" },
      });
      if (!response.ok) {
        res.status(response.status).json({ error: await readProviderError(response) });
        return;
      }
    }

    res.json(
      UpdateParkPackMembershipResponse.parse({
        parkId,
        isMember: body.data.action === "join",
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