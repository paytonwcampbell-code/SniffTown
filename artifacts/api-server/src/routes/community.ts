import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  AddDogToPackParams,
  AddDogToPackResponse,
  CreateDogBody,
  CreateDogResponse,
  ListDogsQueryParams,
  ListDogsResponse,
  ListPacksResponse,
  ListParksResponse,
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
    const [dogs, profiles, memberships] = await Promise.all([
      rpcRows("get_dogs_for_matching", authHeaders),
      jsonRows("/rest/v1/profiles?select=id,full_name", authHeaders),
      jsonRows("/rest/v1/pack_members?select=id,pack_id,user_id,joined_at", authHeaders),
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
    const userIsInPack = new Set(
      memberships
        .filter((member) => member.user_id === currentUserId)
        .map((member) => String(member.pack_id)),
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
      isInPack: userIsInPack.size > 0,
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
  const packs = await jsonRows(
    "/rest/v1/packs?select=id&is_public=eq.true&order=created_at.asc&limit=1",
    { Authorization: `Bearer ${token}` },
  );
  if (!packs[0]) {
    res.status(409).json({ error: "No public pack is available yet." });
    return;
  }

  const response = await supabaseUserRequest("/rest/v1/pack_members", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      pack_id: packs[0].id,
      user_id: user.id,
    }),
  });
  if (!response.ok) {
    res.status(response.status).json({ error: await readProviderError(response) });
    return;
  }
  const rows = (await response.json()) as RecordValue[];
  const membership = rows[0] ?? {};
  res.status(201).json(
    AddDogToPackResponse.parse({
      id: String(membership.id ?? randomUUID()),
      dogId: params.data.dogId,
      packId: String(packs[0].id),
      status: "member",
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