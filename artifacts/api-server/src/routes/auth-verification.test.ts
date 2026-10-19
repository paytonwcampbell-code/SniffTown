import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { after, test } from "node:test";
import cookieParser from "cookie-parser";
import express from "express";
import authRouter from "./auth.ts";

type SupabaseCall = { path: string; search: URLSearchParams; method: string; authorization: string | null; body: unknown };

const MEMBER = "10000000-0000-4000-8000-000000000001";
const calls: SupabaseCall[] = [];
const originalFetch = globalThis.fetch;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseAnonKey = process.env.SUPABASE_ANON_KEY;
let resendStatus = 200;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

process.env.SUPABASE_URL = "https://supabase.invalid";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
delete process.env.SNIFFTOWN_SITE_URL;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  const headers = new Headers(init?.headers);
  const call = {
    path: url.pathname,
    search: url.searchParams,
    method: init?.method ?? "GET",
    authorization: headers.get("authorization"),
    body: typeof init?.body === "string" && init.body ? JSON.parse(init.body) : null,
  };
  calls.push(call);
  if (url.origin !== "https://supabase.invalid") throw new Error(`Unexpected request: ${url}`);

  if (url.pathname === "/auth/v1/signup") {
    return jsonResponse({ user: { id: MEMBER, email: "new@example.test" } });
  }
  if (url.pathname === "/auth/v1/user") {
    return call.authorization === "Bearer verified-access"
      ? jsonResponse({ id: MEMBER, email: "new@example.test", user_metadata: { full_name: "New Member" } })
      : jsonResponse({ message: "invalid JWT" }, 401);
  }
  if (url.pathname === "/auth/v1/resend") {
    return resendStatus === 200 ? jsonResponse({}) : jsonResponse({ message: "provider said no" }, resendStatus);
  }
  throw new Error(`Unexpected Supabase path: ${url.pathname}`);
};

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use((req, _res, next) => {
  const quiet = () => undefined;
  req.log = { error: quiet, warn: quiet, info: quiet } as unknown as typeof req.log;
  next();
});
app.use(authRouter);
const server: Server = createServer(app);
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}`;

async function post(path: string, body: unknown, origin?: string) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (origin) headers.set("Origin", origin);
  const response = await originalFetch(`${baseUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, setCookie: response.headers.getSetCookie(), body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
}

function reset() {
  calls.splice(0);
  resendStatus = 200;
}

test("sign-up asks Supabase to send the verification link back to the site's verified page", async () => {
  reset();
  await post("/auth/signup", { email: "new@example.test", password: "long-enough" }, "https://snifftown.com");
  assert.equal(calls[0]?.search.get("redirect_to"), "https://snifftown.com/auth/verified");
});

test("sign-ups without a browser origin (the mobile app) land on the public site", async () => {
  reset();
  await post("/auth/signup", { email: "new@example.test", password: "long-enough" });
  assert.equal(calls[0]?.search.get("redirect_to"), "https://snifftown.com/auth/verified");
});

test("non-https origins are never used as a redirect target", async () => {
  reset();
  await post("/auth/signup", { email: "new@example.test", password: "long-enough" }, "http://evil.example");
  assert.equal(calls[0]?.search.get("redirect_to"), "https://snifftown.com/auth/verified");
});

test("a verified session is checked with Supabase before cookies are set", async () => {
  reset();
  const response = await post("/auth/verified-session", { accessToken: "verified-access", refreshToken: "verified-refresh" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body?.user, { id: MEMBER, email: "new@example.test", displayName: "New Member" });
  assert.equal(calls[0]?.authorization, "Bearer verified-access");
  const cookies = response.setCookie.join("\n");
  assert.match(cookies, /snifftown_access=verified-access/);
  assert.match(cookies, /snifftown_refresh=verified-refresh/);
  assert.match(cookies, /HttpOnly/);
});

test("an invalid or expired verification session sets no cookies", async () => {
  reset();
  const response = await post("/auth/verified-session", { accessToken: "forged", refreshToken: "forged" });

  assert.equal(response.status, 401);
  assert.deepEqual(response.setCookie, []);
});

test("a verification session without tokens is rejected before reaching Supabase", async () => {
  reset();
  const response = await post("/auth/verified-session", { accessToken: "" });

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("resending a link uses the signup type and the verified page", async () => {
  reset();
  const response = await post("/auth/resend-verification", { email: " new@example.test " }, "https://snifftown.com");

  assert.equal(response.status, 202);
  assert.deepEqual(calls[0]?.body, { type: "signup", email: "new@example.test" });
  assert.equal(calls[0]?.search.get("redirect_to"), "https://snifftown.com/auth/verified");
});

test("resend never reveals whether an account exists", async () => {
  reset();
  resendStatus = 400;
  const response = await post("/auth/resend-verification", { email: "nobody@example.test" });

  assert.equal(response.status, 202);
});

test("resend passes through Supabase rate limits and rejects malformed emails", async () => {
  reset();
  resendStatus = 429;
  const limited = await post("/auth/resend-verification", { email: "new@example.test" });
  const malformed = await post("/auth/resend-verification", { email: "not an email" });

  assert.equal(limited.status, 429);
  assert.equal(malformed.status, 400);
  assert.equal(calls.length, 1);
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabaseAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY;
  else process.env.SUPABASE_ANON_KEY = originalSupabaseAnonKey;
  server.close();
});
