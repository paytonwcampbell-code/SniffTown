import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { after, test } from "node:test";
import cookieParser from "cookie-parser";
import express from "express";
import authRouter from "./auth.ts";
import messagingRouter from "./messaging.ts";
import safetyRouter from "./safety.ts";

type SupabaseCall = {
  path: string;
  search: string;
  method: string;
  authorization: string | null;
  body: unknown;
};

const ME = "10000000-0000-4000-8000-000000000001";
const BLOCKED = "10000000-0000-4000-8000-000000000002";
const FRIEND = "10000000-0000-4000-8000-000000000003";
const GONE = "10000000-0000-4000-8000-000000000004";
const RATE_LIMITED = "10000000-0000-4000-8000-000000000005";
const BLOCKED_CONVERSATION = "30000000-0000-4000-8000-000000000001";
const FRIEND_CONVERSATION = "30000000-0000-4000-8000-000000000002";

const calls: SupabaseCall[] = [];
const originalFetch = globalThis.fetch;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseAnonKey = process.env.SUPABASE_ANON_KEY;
let deleteAccountFails = false;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bodyFrom(init?: RequestInit): unknown {
  if (typeof init?.body !== "string" || !init.body) return null;
  return JSON.parse(init.body);
}

function resetCalls() {
  calls.splice(0);
  deleteAccountFails = false;
}

process.env.SUPABASE_URL = "https://supabase.invalid";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
delete process.env.SNIFFTOWN_MODERATION_EMAIL;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  const headers = new Headers(init?.headers);
  const call = {
    path: url.pathname,
    search: decodeURIComponent(url.search),
    method: init?.method ?? "GET",
    authorization: headers.get("authorization"),
    body: bodyFrom(init),
  };
  calls.push(call);

  if (url.origin !== "https://supabase.invalid") {
    throw new Error(`Unexpected non-Supabase transport request: ${url}`);
  }

  if (url.pathname === "/auth/v1/user") {
    return call.authorization === "Bearer member-token"
      ? jsonResponse({ id: ME })
      : jsonResponse({ message: "invalid token" }, 401);
  }

  if (url.pathname === "/rest/v1/user_blocks") {
    if (call.method === "GET") {
      return jsonResponse([
        { blocked_id: BLOCKED, created_at: "2026-10-11T10:00:00+00:00" },
      ]);
    }
    if (call.method === "POST") {
      const target = (call.body as { blocked_id?: string }).blocked_id;
      return target === GONE
        ? jsonResponse({ code: "23503", message: "fk violation" }, 409)
        : new Response(null, { status: 201 });
    }
    return new Response(null, { status: 204 });
  }

  if (url.pathname === "/rest/v1/rpc/report_user") {
    const target = (call.body as { target_user_id?: string }).target_user_id;
    if (target === GONE) {
      return jsonResponse({ code: "P0002", message: "That member is no longer on SniffTown." }, 400);
    }
    if (target === RATE_LIMITED) {
      return jsonResponse({ code: "54000", message: "You have sent several reports today." }, 400);
    }
    return jsonResponse([{ report_id: "report-1", status: "open" }]);
  }

  if (url.pathname === "/rest/v1/rpc/is_blocked_with") {
    const other = (call.body as { other_user_id?: string }).other_user_id;
    return jsonResponse(other === BLOCKED);
  }

  if (url.pathname === "/rest/v1/rpc/get_user_conversations") {
    return jsonResponse([
      { id: BLOCKED_CONVERSATION, participant_1_id: ME, participant_2_id: BLOCKED, other_user_id: BLOCKED, created_at: "2026-10-01T00:00:00Z", unread_count: 0 },
      { id: FRIEND_CONVERSATION, participant_1_id: ME, participant_2_id: FRIEND, other_user_id: FRIEND, created_at: "2026-10-01T00:00:00Z", unread_count: 1 },
    ]);
  }

  if (url.pathname === "/rest/v1/rpc/delete_my_account") {
    return deleteAccountFails
      ? jsonResponse({ code: "23503", message: "still referenced" }, 409)
      : new Response(null, { status: 204 });
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
app.use(messagingRouter);
app.use(safetyRouter);
const server: Server = createServer(app);
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}`;

async function request(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  token?: string,
  body?: unknown,
) {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const response = await originalFetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    setCookie: response.headers.getSetCookie(),
    body: text ? (JSON.parse(text) as unknown) : null,
  };
}

const supabasePaths = () => calls.map((call) => `${call.method} ${call.path}`);

test("anonymous members cannot block, report, list blocks, or delete an account", async () => {
  resetCalls();
  const responses = await Promise.all([
    request("GET", "/blocks"),
    request("PUT", `/users/${FRIEND}/block`),
    request("DELETE", `/users/${FRIEND}/block`),
    request("POST", `/users/${FRIEND}/reports`, undefined, { context: "conversation", reason: "spam" }),
    request("DELETE", "/auth/account"),
  ]);

  assert.deepEqual(responses.map((r) => r.status), [401, 401, 401, 401, 401]);
  assert.deepEqual(
    supabasePaths().filter((path) => !path.endsWith("/auth/v1/user")),
    [],
  );
});

test("blocking uses the verified member id, never a client-supplied one", async () => {
  resetCalls();
  const response = await request("PUT", `/users/${FRIEND}/block`, "member-token", {
    blocker_id: BLOCKED,
  });

  assert.equal(response.status, 204);
  const insert = calls.find((call) => call.path === "/rest/v1/user_blocks");
  assert.deepEqual(insert?.body, { blocker_id: ME, blocked_id: FRIEND });
  assert.equal(insert?.authorization, "Bearer member-token");
});

test("members cannot block themselves and blocking a deleted member is a 404", async () => {
  resetCalls();
  const self = await request("PUT", `/users/${ME}/block`, "member-token");
  const gone = await request("PUT", `/users/${GONE}/block`, "member-token");

  assert.equal(self.status, 400);
  assert.equal(gone.status, 404);
});

test("invalid member ids are rejected before reaching Supabase", async () => {
  resetCalls();
  const response = await request("PUT", "/users/not-a-uuid/block", "member-token");

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("unblocking only deletes the caller's own block row", async () => {
  resetCalls();
  const response = await request("DELETE", `/users/${BLOCKED}/block`, "member-token");

  assert.equal(response.status, 204);
  const deletion = calls.find((call) => call.method === "DELETE");
  assert.equal(deletion?.search, `?blocker_id=eq.${ME}&blocked_id=eq.${BLOCKED}`);
});

test("blocked members are listed for the caller", async () => {
  resetCalls();
  const response = await request("GET", "/blocks", "member-token");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [
    { userId: BLOCKED, blockedAt: "2026-10-11T10:00:00+00:00" },
  ]);
});

test("reports are filed through the report_user RPC", async () => {
  resetCalls();
  const response = await request("POST", `/users/${FRIEND}/reports`, "member-token", {
    context: "dog_profile",
    reason: "inappropriate",
    details: "  Not a dog photo  ",
  });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, { reportId: "report-1", status: "open" });
  const rpc = calls.find((call) => call.path === "/rest/v1/rpc/report_user");
  assert.deepEqual(rpc?.body, {
    target_user_id: FRIEND,
    report_context: "dog_profile",
    report_reason: "inappropriate",
    report_details: "Not a dog photo",
  });
});

test("report errors map to friendly statuses", async () => {
  resetCalls();
  const [gone, limited, invalid] = await Promise.all([
    request("POST", `/users/${GONE}/reports`, "member-token", { context: "conversation", reason: "spam" }),
    request("POST", `/users/${RATE_LIMITED}/reports`, "member-token", { context: "conversation", reason: "spam" }),
    request("POST", `/users/${FRIEND}/reports`, "member-token", { context: "conversation", reason: "made-up" }),
  ]);

  assert.equal(gone.status, 404);
  assert.equal(limited.status, 429);
  assert.equal(invalid.status, 400);
});

test("conversations with blocked members are hidden from the inbox", async () => {
  resetCalls();
  const response = await request("GET", "/conversations", "member-token");

  assert.equal(response.status, 200);
  assert.deepEqual(
    (response.body as { id: string }[]).map((conversation) => conversation.id),
    [FRIEND_CONVERSATION],
  );
});

test("messages to or from a blocked member are refused before any write", async () => {
  resetCalls();
  const response = await request("POST", "/messages", "member-token", {
    receiverId: BLOCKED,
    content: "hello",
  });

  assert.equal(response.status, 403);
  assert.ok(!calls.some((call) => call.method === "POST" && call.path.startsWith("/rest/v1/messages")));
  assert.ok(!calls.some((call) => call.method === "POST" && call.path.startsWith("/rest/v1/conversations")));
});

test("account deletion runs the RPC with the member's token and clears session cookies", async () => {
  resetCalls();
  const response = await request("DELETE", "/auth/account", "member-token");

  assert.equal(response.status, 204);
  const rpc = calls.find((call) => call.path === "/rest/v1/rpc/delete_my_account");
  assert.equal(rpc?.method, "POST");
  assert.equal(rpc?.authorization, "Bearer member-token");
  const cleared = response.setCookie.join("\n");
  assert.match(cleared, /snifftown_access=;/);
  assert.match(cleared, /snifftown_refresh=;/);
});

test("a failed account deletion keeps the session and reports that nothing was removed", async () => {
  resetCalls();
  deleteAccountFails = true;
  const response = await request("DELETE", "/auth/account", "member-token");

  assert.equal(response.status, 502);
  assert.match(String((response.body as { error: string }).error), /Nothing was removed/);
  assert.deepEqual(response.setCookie, []);
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabaseAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY;
  else process.env.SUPABASE_ANON_KEY = originalSupabaseAnonKey;
  server.close();
});
