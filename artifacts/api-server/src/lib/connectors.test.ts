import assert from "node:assert/strict";
import test from "node:test";
import {
  supabaseRequest,
  supabaseUserRequest,
} from "./connectors.ts";

const originalUrl = process.env.SUPABASE_URL;
const originalAnonKey = process.env.SUPABASE_ANON_KEY;
const originalFetch = globalThis.fetch;

function restoreRuntime() {
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;

  if (originalAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY;
  else process.env.SUPABASE_ANON_KEY = originalAnonKey;

  globalThis.fetch = originalFetch;
}

test.afterEach(restoreRuntime);
test.after(restoreRuntime);

test("supabaseRequest uses the project URL and anon key without changing request data", async () => {
  process.env.SUPABASE_URL = "https://project.example///";
  process.env.SUPABASE_ANON_KEY = "public-anon-key";
  const body = JSON.stringify({ email: "member@example.com", password: "password123" });
  let captured: Parameters<typeof fetch> | undefined;

  globalThis.fetch = async (...args) => {
    captured = args;
    return new Response(null, { status: 204 });
  };

  await supabaseRequest("/auth/v1/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Source": "api",
    },
    body,
  });

  assert.ok(captured);
  assert.equal(captured[0], "https://project.example/auth/v1/signup");
  assert.deepEqual(captured[1], {
    method: "POST",
    headers: {
      apikey: "public-anon-key",
      "Content-Type": "application/json",
      "X-Request-Source": "api",
    },
    body,
  });
});

test("supabaseUserRequest preserves the member bearer token", async () => {
  process.env.SUPABASE_URL = "https://project.example";
  process.env.SUPABASE_ANON_KEY = "public-anon-key";
  let captured: Parameters<typeof fetch> | undefined;

  globalThis.fetch = async (...args) => {
    captured = args;
    return new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await supabaseUserRequest("/rest/v1/dogs?select=id", {
    headers: {
      Authorization: "Bearer member-token",
      Accept: "application/json",
    },
  });

  assert.ok(captured);
  assert.deepEqual(captured[1]?.headers, {
    apikey: "public-anon-key",
    Authorization: "Bearer member-token",
    Accept: "application/json",
  });
});

test("Supabase requests fail explicitly when project configuration is missing", async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response();
  };

  await assert.rejects(
    supabaseRequest("/rest/v1/parks"),
    /Supabase access is not configured/,
  );
  assert.equal(fetchCalled, false);
});