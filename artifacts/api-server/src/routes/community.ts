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
  RespondToPackRequestBody,
  RespondToPackRequestParams,
  RespondToPackRequestResponse,
} from "@workspace/api-zod";
import {
  readProviderError,
  supabaseRequest,
  supabaseUserRequest,
} from "../lib/connectors";

const router: IRouter = Router();
const ACCESS_COOKIE = "snifftown_access";

type RecordValue = Record<string, unknown>;

function bearer(req: { cookies?: Record<string, unknown> }): Record<string, string> {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
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
    const currentUserId =
      typeof req.cookies?.snifftown_user_id === "string"
        ? req.cookies.snifftown_user_id
        : null;
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
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
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
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
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
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
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

  const incomingResponse = await supabaseUserRequest(
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
  if (incomingResponse.ok) {
    const incoming = (await incomingResponse.json()) as RecordValue[];
    const reciprocal = incoming.find(
      (request) =>
        String(request.from_dog_id ?? "") === params.data.dogId &&
        String(request.status ?? "pending") === "pending",
    );
    if (reciprocal?.id) {
      const matchResponse = await supabaseUserRequest(
        "/rest/v1/rpc/respond_to_pack_request",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            request_id: reciprocal.id,
            new_status: "accepted",
          }),
        },
      );
      if (!matchResponse.ok) {
        res.status(matchResponse.status).json({
          error: await readProviderError(matchResponse),
        });
        return;
      }
      res.status(201).json(
        AddDogToPackResponse.parse({
          id: String(reciprocal.id),
          dogId: params.data.dogId,
          status: "matched",
        }),
      );
      return;
    }
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
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
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
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
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
  try {
    const [parks, packs] = await Promise.all([
      jsonRows("/rest/v1/parks?select=*&order=name.asc&limit=50"),
      jsonRows("/rest/v1/packs?select=id,name,location,is_public&is_public=eq.true"),
    ]);
    const result = parks.map((park) => ({
      id: String(park.id),
      name: String(park.name),
      city: String(park.city),
      state: String(park.state),
      slug: String(park.slug),
      packCount: packs.filter((pack) => pack.id === park.id).length,
    }));
    res.json(ListParksResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "Unable to list parks");
    res.status(502).json({ error: "Unable to load parks right now." });
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