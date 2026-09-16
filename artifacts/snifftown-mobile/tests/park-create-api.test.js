import { createServer } from "node:http";
import express from "../../api-server/node_modules/express/index.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  supabaseRequest: vi.fn(),
  supabaseUserRequest: vi.fn(),
  readProviderError: vi.fn(async (response) => response.text()),
}));

vi.mock("../../api-server/src/lib/connectors.ts", () => supabaseMocks);

import communityRouter from "../../api-server/src/routes/community.ts";

const USER_ID = "creator-user";
const ACCESS_TOKEN = "creator-token";
const EXISTING_PARKS = [
  {
    id: "seed-park",
    name: "Existing Park",
    metro_id: "austin-metro",
  },
];

const userCalls = [];
let existingParks = EXISTING_PARKS;
let server;
let baseUrl;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestBody(call) {
  return call.init?.body ? JSON.parse(call.init.body) : undefined;
}

function parkCreateCalls() {
  return userCalls.filter(
    (call) => call.path === "/rest/v1/parks" && call.init?.method === "POST",
  );
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(communityRouter);
  server = createServer(app);

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("The test server did not expose a TCP address.");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  existingParks = EXISTING_PARKS;
  userCalls.splice(0);
  supabaseMocks.supabaseRequest.mockReset();
  supabaseMocks.supabaseUserRequest.mockReset();
  supabaseMocks.readProviderError.mockClear();

  supabaseMocks.supabaseRequest.mockImplementation(async (path) => {
    if (path === "/rest/v1/parks?select=id,name,metro_id&limit=100") {
      return jsonResponse(existingParks);
    }
    if (path === "/rest/v1/packs?select=id,location&is_public=eq.true&limit=100") {
      return jsonResponse([]);
    }
    throw new Error(`Unexpected unauthenticated Supabase path: ${path}`);
  });

  supabaseMocks.supabaseUserRequest.mockImplementation(async (path, init) => {
    userCalls.push({ path, init });
    if (path === "/auth/v1/user") {
      return jsonResponse({ id: USER_ID });
    }
    if (
      path === "/rest/v1/parks" ||
      path === "/rest/v1/packs" ||
      path === "/rest/v1/pack_members"
    ) {
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected authenticated Supabase path: ${path}`);
  });
});

afterAll(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function createPark(name, address) {
  const response = await fetch(`${baseUrl}/parks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, address }),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

describe("POST /parks", () => {
  it("inserts creator membership and returns the joined park pack", async () => {
    const response = await createPark("Maple Run", "120 Maple Run Road");

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: "Maple Run",
      city: "Austin",
      state: "TX",
      address: "120 Maple Run Road",
      communityCreated: true,
      memberCount: 1,
      isMember: true,
      isCreator: true,
    });

    const membershipCalls = userCalls.filter(
      (call) =>
        call.path === "/rest/v1/pack_members" && call.init?.method === "POST",
    );
    expect(membershipCalls).toHaveLength(1);
    expect(requestBody(membershipCalls[0])).toEqual({
      pack_id: response.body.id,
      user_id: USER_ID,
    });
  });

  it("returns 409 and does not create anything for a duplicate park", async () => {
    existingParks = [
      {
        id: "existing-maple-run",
        name: "Maple Run",
        metro_id: "austin-metro",
      },
    ];

    const response = await createPark(" maple run ", "120 Maple Run Road");

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "A local park pack already exists for that park or address.",
    });
    expect(parkCreateCalls()).toHaveLength(0);
    expect(
      userCalls.filter(
        (call) =>
          call.path === "/rest/v1/pack_members" && call.init?.method === "POST",
      ),
    ).toHaveLength(0);
  });
});