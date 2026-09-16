import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { after, test } from "node:test";
import express from "express";
import notificationsRouter from "./notifications.ts";

type SupabaseCall = {
  path: string;
  method: string;
  authorization: string | null;
  body: Record<string, unknown> | null;
};

const NOTIFICATION_ID = "00000000-0000-4000-8000-000000000001";
const calls: SupabaseCall[] = [];
const originalFetch = globalThis.fetch;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseAnonKey = process.env.SUPABASE_ANON_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bodyFrom(init?: RequestInit): Record<string, unknown> | null {
  if (typeof init?.body !== "string" || !init.body) return null;
  return JSON.parse(init.body) as Record<string, unknown>;
}

function resetCalls() {
  calls.splice(0);
}

process.env.SUPABASE_URL = "https://supabase.invalid";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  const headers = new Headers(init?.headers);
  const authorization = headers.get("authorization");
  const call = {
    path: url.pathname,
    method: init?.method ?? "GET",
    authorization,
    body: bodyFrom(init),
  };
  calls.push(call);

  if (url.origin !== "https://supabase.invalid") {
    throw new Error(`Unexpected non-Supabase transport request: ${url}`);
  }

  if (url.pathname === "/rest/v1/rpc/list_notifications") {
    return jsonResponse([
      {
        id: NOTIFICATION_ID,
        type: "park_post_report",
        title: "A title supplied by an untrusted source",
        body: "A body supplied by an untrusted source",
        data: {
          parkId: "park-1",
          packId: "pack-1",
          screen: "moderation",
          reporterId: "must-not-leak",
          postContent: "must-not-leak",
        },
        created_at: "2026-09-16T10:00:00.123456+00:00",
        read_at: null,
      },
    ]);
  }

  if (url.pathname === "/rest/v1/rpc/mark_notification_read") {
    if (
      call.body?.target_created_at === "2026-09-16T10:00:01.000000+00:00"
    ) {
      return jsonResponse([
        {
          id: NOTIFICATION_ID,
          read_at: null,
        },
      ]);
    }
    return jsonResponse([
      {
        id: NOTIFICATION_ID,
        read_at: "2026-09-16T10:01:00.000Z",
      },
    ]);
  }

  if (url.pathname === "/rest/v1/rpc/unknown") {
    return jsonResponse({ message: "Notification not found." }, 404);
  }

  throw new Error(`Unexpected Supabase path: ${url.pathname}`);
};

const app = express();
app.use(express.json());
app.use(notificationsRouter);
const server: Server = createServer(app);
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}`;

async function request(
  method: "GET" | "POST",
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
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown> | unknown[],
  };
}

test("anonymous members cannot read or update notifications", async () => {
  resetCalls();
  const [list, read] = await Promise.all([
    request("GET", "/notifications"),
    request("POST", `/notifications/${NOTIFICATION_ID}/read`),
  ]);

  assert.equal(list.status, 401);
  assert.equal(read.status, 401);
  assert.equal(calls.length, 0);
});

test("notification list is private, static, and reporter-safe", async () => {
  resetCalls();
  const response = await request("GET", "/notifications", "moderator-token");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [
    {
      id: NOTIFICATION_ID,
      type: "park_post_report",
      title: "Park pack post needs review",
      body: "A new report is waiting in the moderation queue.",
      data: {
        parkId: "park-1",
        packId: "pack-1",
        screen: "moderation",
      },
      createdAt: "2026-09-16T10:00:00.123Z",
      revision: "2026-09-16T10:00:00.123456+00:00",
      readAt: null,
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(response.body),
    /must-not-leak|reporter|postContent|contact/i,
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    path: "/rest/v1/rpc/list_notifications",
    method: "POST",
    authorization: "Bearer moderator-token",
    body: { target_limit: 100 },
  });
});

test("notification revisions survive list-to-read acknowledgment", async () => {
  resetCalls();
  const list = await request("GET", "/notifications", "moderator-token");
  assert.equal(list.status, 200);
  const listedNotification = (list.body as Array<Record<string, unknown>>)[0];
  assert.equal(
    listedNotification?.revision,
    "2026-09-16T10:00:00.123456+00:00",
  );

  const read = await request(
    "POST",
    `/notifications/${NOTIFICATION_ID}/read`,
    "moderator-token",
    { revision: listedNotification?.revision },
  );
  assert.equal(read.status, 200);
  assert.deepEqual(calls[1]?.body, {
    target_notification_id: NOTIFICATION_ID,
    target_created_at: "2026-09-16T10:00:00.123456+00:00",
  });
});

test("a moderator can mark an alert read through the generated contract", async () => {
  resetCalls();
  const response = await request(
    "POST",
    `/notifications/${NOTIFICATION_ID}/read`,
    "moderator-token",
    { revision: "2026-09-16T10:00:00.123456+00:00" },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    success: true,
    notificationId: NOTIFICATION_ID,
    readAt: "2026-09-16T10:01:00.000Z",
  });
  assert.deepEqual(calls[0], {
    path: "/rest/v1/rpc/mark_notification_read",
    method: "POST",
    authorization: "Bearer moderator-token",
    body: {
      target_notification_id: NOTIFICATION_ID,
      target_created_at: "2026-09-16T10:00:00.123456+00:00",
    },
  });
});

test("a stale notification acknowledgment remains unread", async () => {
  resetCalls();
  const response = await request(
    "POST",
    `/notifications/${NOTIFICATION_ID}/read`,
    "moderator-token",
    { revision: "2026-09-16T10:00:01.000000+00:00" },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    success: true,
    notificationId: NOTIFICATION_ID,
    readAt: null,
  });
  assert.deepEqual(calls[0], {
    path: "/rest/v1/rpc/mark_notification_read",
    method: "POST",
    authorization: "Bearer moderator-token",
    body: {
      target_notification_id: NOTIFICATION_ID,
      target_created_at: "2026-09-16T10:00:01.000000+00:00",
    },
  });
});

test("read acknowledgments require an observed notification revision", async () => {
  resetCalls();
  const response = await request(
    "POST",
    `/notifications/${NOTIFICATION_ID}/read`,
    "moderator-token",
  );

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "Provide the notification's observed revision.",
  });
  assert.equal(calls.length, 0);
});

test("malformed observed revisions never reach Supabase", async () => {
  resetCalls();
  const response = await request(
    "POST",
    `/notifications/${NOTIFICATION_ID}/read`,
    "moderator-token",
    { revision: "" },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "Provide the notification's observed revision.",
  });
  assert.equal(calls.length, 0);
});

test("invalid notification ids never reach Supabase", async () => {
  resetCalls();
  const response = await request(
    "POST",
    "/notifications/not-a-uuid/read",
    "moderator-token",
    { revision: "2026-09-16T10:00:00.123456+00:00" },
  );

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

after(async () => {
  server.close();
  await once(server, "close");
  globalThis.fetch = originalFetch;
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabaseAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY;
  else process.env.SUPABASE_ANON_KEY = originalSupabaseAnonKey;
});