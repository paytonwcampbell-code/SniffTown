import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { after, test } from "node:test";
import express from "express";
import communityRouter from "./community.ts";

type SupabaseCall = {
  path: string;
  method: string;
  authorization: string | null;
  apiKey: string | null;
  body: Record<string, unknown> | null;
};

const PACK_ID = "park-pack-1";
const POST_ID = "post-1";
const REPORT_ID = "report-1";
const originalFetch = globalThis.fetch;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const calls: SupabaseCall[] = [];

const viewers = new Map([
  ["nonmember-token", { id: "nonmember-id", email: "outsider@example.test" }],
  ["member-token", { id: "member-id", email: "member@example.test" }],
  ["rate-limited-member-token", { id: "rate-limited-member-id", email: "limited@example.test" }],
  ["nonmoderator-token", { id: "nonmoderator-id", email: "neighbor@example.test" }],
  ["creator-token", { id: "creator-id", email: "creator@example.test" }],
  ["designated-admin-token", { id: "designated-admin-id", email: "admin@example.test" }],
]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function providerError(message: string, status = 403): Response {
  return jsonResponse({ message }, status);
}

function bodyFrom(init?: RequestInit): Record<string, unknown> | null {
  if (typeof init?.body !== "string" || !init.body) return null;
  return JSON.parse(init.body) as Record<string, unknown>;
}

function resetCalls() {
  calls.splice(0);
}

function rpcCalls(name: string) {
  return calls.filter((call) => call.path === `/rest/v1/rpc/${name}`);
}

process.env.SUPABASE_URL = "https://supabase.invalid";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  const headers = new Headers(init?.headers);
  const authorization = headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const call = {
    path: url.pathname,
    method: init?.method ?? "GET",
    authorization,
    apiKey: headers.get("apikey"),
    body: bodyFrom(init),
  };
  calls.push(call);

  if (url.origin !== "https://supabase.invalid") {
    throw new Error(`Unexpected non-Supabase transport request: ${url}`);
  }

  if (url.pathname === "/auth/v1/user") {
    const viewer = viewers.get(token);
    return viewer
      ? jsonResponse(viewer)
      : providerError("Invalid JWT", 401);
  }

  if (url.pathname === "/rest/v1/rpc/report_pack_post") {
    if (token === "nonmember-token") {
      return providerError("Join this park pack before reporting posts.");
    }
    if (token === "rate-limited-member-token") {
      return providerError(
        "Report rate limit reached. Try again in an hour.",
        400,
      );
    }
    return jsonResponse([{ report_id: REPORT_ID, status: "open" }]);
  }

  if (url.pathname === "/rest/v1/rpc/get_pack_post_reports_for_moderation") {
    if (token !== "creator-token" && token !== "designated-admin-token") {
      return providerError("Only park-pack moderators can review reports.");
    }
    return jsonResponse([
      {
        id: REPORT_ID,
        post_id: POST_ID,
        post_content: "Repeated promotion",
        author_display_name: "Alex A.",
        reason: "spam",
        details: "Seen several times.",
        created_at: "2026-09-16T10:00:00.000Z",
        reporter_id: "reporter-id-must-not-leak",
        reporter_email: "reporter@example.test",
        reporter_contact_email: "private-contact@example.test",
        contact_email: "another-private-contact@example.test",
      },
    ]);
  }

  if (url.pathname === "/rest/v1/rpc/moderate_pack_post_report") {
    if (token !== "creator-token" && token !== "designated-admin-token") {
      return providerError("Only park-pack moderators can moderate reports.");
    }
    const action = call.body?.moderation_action;
    return jsonResponse([
      {
        report_id: REPORT_ID,
        post_id: POST_ID,
        status: action === "dismiss" ? "dismissed" : "actioned",
        action,
      },
    ]);
  }

  throw new Error(`Unexpected Supabase path: ${url.pathname}`);
};

const app = express();
app.use(express.json());
app.use(communityRouter);
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
  body?: Record<string, unknown>,
) {
  const response = await originalFetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

function assertViewerRpc(
  name: string,
  token: string,
  expectedBody: Record<string, unknown>,
) {
  const requests = rpcCalls(name);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].authorization, `Bearer ${token}`);
  assert.equal(requests[0].apiKey, "test-anon-key");
  assert.deepEqual(requests[0].body, expectedBody);
}

test("anonymous viewers cannot report, enumerate reports, or moderate", async () => {
  resetCalls();

  const [report, list, moderate] = await Promise.all([
    request("POST", `/parks/${PACK_ID}/posts/${POST_ID}/reports`, undefined, {
      reason: "spam",
    }),
    request("GET", `/parks/${PACK_ID}/moderation/reports`),
    request(
      "POST",
      `/parks/${PACK_ID}/moderation/reports/${REPORT_ID}`,
      undefined,
      { action: "hide" },
    ),
  ]);

  assert.equal(report.status, 401);
  assert.equal(list.status, 401);
  assert.equal(moderate.status, 401);
  assert.equal(calls.length, 0);
});

test("a nonmember is denied reporting and every moderation RPC", async () => {
  resetCalls();

  const report = await request(
    "POST",
    `/parks/${PACK_ID}/posts/${POST_ID}/reports`,
    "nonmember-token",
    { reason: "spam", details: "Unwanted advertising" },
  );
  assert.equal(report.status, 403);
  assert.equal(report.body.error, "Join this park pack before reporting posts.");
  assertViewerRpc("report_pack_post", "nonmember-token", {
    target_pack_id: PACK_ID,
    target_post_id: POST_ID,
    report_reason: "spam",
    report_details: "Unwanted advertising",
  });

  resetCalls();
  const list = await request(
    "GET",
    `/parks/${PACK_ID}/moderation/reports`,
    "nonmember-token",
  );
  assert.equal(list.status, 403);
  assert.equal(
    list.body.error,
    "Only this pack's creator or moderators can review reports.",
  );
  assertViewerRpc(
    "get_pack_post_reports_for_moderation",
    "nonmember-token",
    { target_pack_id: PACK_ID },
  );

  resetCalls();
  const moderate = await request(
    "POST",
    `/parks/${PACK_ID}/moderation/reports/${REPORT_ID}`,
    "nonmember-token",
    { action: "hide" },
  );
  assert.equal(moderate.status, 403);
  assertViewerRpc("moderate_pack_post_report", "nonmember-token", {
    target_pack_id: PACK_ID,
    target_report_id: REPORT_ID,
    moderation_action: "hide",
  });
});

test("a member can submit a spam report but cannot review or moderate it", async () => {
  resetCalls();

  const report = await request(
    "POST",
    `/parks/${PACK_ID}/posts/${POST_ID}/reports`,
    "member-token",
    { reason: "spam", details: "  Repeated promotion  " },
  );
  assert.equal(report.status, 201);
  assert.deepEqual(report.body, { reportId: REPORT_ID, status: "open" });
  assertViewerRpc("report_pack_post", "member-token", {
    target_pack_id: PACK_ID,
    target_post_id: POST_ID,
    report_reason: "spam",
    report_details: "Repeated promotion",
  });

  resetCalls();
  const list = await request(
    "GET",
    `/parks/${PACK_ID}/moderation/reports`,
    "nonmoderator-token",
  );
  assert.equal(list.status, 403);
  assertViewerRpc(
    "get_pack_post_reports_for_moderation",
    "nonmoderator-token",
    { target_pack_id: PACK_ID },
  );

  resetCalls();
  const moderate = await request(
    "POST",
    `/parks/${PACK_ID}/moderation/reports/${REPORT_ID}`,
    "nonmoderator-token",
    { action: "dismiss" },
  );
  assert.equal(moderate.status, 403);
  assertViewerRpc("moderate_pack_post_report", "nonmoderator-token", {
    target_pack_id: PACK_ID,
    target_report_id: REPORT_ID,
    moderation_action: "dismiss",
  });
});

test("creator and designated admin can view and act without reporter contact leaks", async () => {
  for (const [token, action] of [
    ["creator-token", "hide"],
    ["designated-admin-token", "dismiss"],
  ] as const) {
    resetCalls();
    const list = await request(
      "GET",
      `/parks/${PACK_ID}/moderation/reports`,
      token,
    );
    assert.equal(list.status, 200);
    assert.deepEqual(list.body, [
      {
        id: REPORT_ID,
        postId: POST_ID,
        postContent: "Repeated promotion",
        authorDisplayName: "Alex A.",
        reason: "spam",
        details: "Seen several times.",
        createdAt: "2026-09-16T10:00:00.000Z",
      },
    ]);
    const serialized = JSON.stringify(list.body);
    assert.doesNotMatch(serialized, /reporter-id-must-not-leak|reporter@example\.test|private-contact@example\.test|contact_email/i);
    assertViewerRpc("get_pack_post_reports_for_moderation", token, {
      target_pack_id: PACK_ID,
    });

    resetCalls();
    const moderate = await request(
      "POST",
      `/parks/${PACK_ID}/moderation/reports/${REPORT_ID}`,
      token,
      { action },
    );
    assert.equal(moderate.status, 200);
    assert.deepEqual(moderate.body, {
      reportId: REPORT_ID,
      postId: POST_ID,
      status: action === "hide" ? "actioned" : "dismissed",
      action,
    });
    assertViewerRpc("moderate_pack_post_report", token, {
      target_pack_id: PACK_ID,
      target_report_id: REPORT_ID,
      moderation_action: action,
    });
  }
});

test("malformed report reasons and moderation actions do not reach Supabase", async () => {
  resetCalls();
  const badReason = await request(
    "POST",
    `/parks/${PACK_ID}/posts/${POST_ID}/reports`,
    "member-token",
    { reason: "not-spam" },
  );
  assert.equal(badReason.status, 400);
  assert.equal(
    badReason.body.error,
    "Choose a report reason and keep any details under 500 characters.",
  );
  assert.equal(rpcCalls("report_pack_post").length, 0);

  resetCalls();
  const oversizedDetails = await request(
    "POST",
    `/parks/${PACK_ID}/posts/${POST_ID}/reports`,
    "member-token",
    { reason: "spam", details: "x".repeat(501) },
  );
  assert.equal(oversizedDetails.status, 400);
  assert.equal(rpcCalls("report_pack_post").length, 0);

  resetCalls();
  const badAction = await request(
    "POST",
    `/parks/${PACK_ID}/moderation/reports/${REPORT_ID}`,
    "creator-token",
    { action: "delete" },
  );
  assert.equal(badAction.status, 400);
  assert.equal(
    badAction.body.error,
    "Choose whether to hide the post or dismiss the report.",
  );
  assert.equal(rpcCalls("moderate_pack_post_report").length, 0);
});

test("report spam rate-limit errors remain explicit and safe", async () => {
  resetCalls();
  const response = await request(
    "POST",
    `/parks/${PACK_ID}/posts/${POST_ID}/reports`,
    "rate-limited-member-token",
    { reason: "spam" },
  );

  assert.equal(response.status, 429);
  assert.deepEqual(response.body, {
    error: "You have reached the report limit. Try again in an hour.",
  });
  assertViewerRpc("report_pack_post", "rate-limited-member-token", {
    target_pack_id: PACK_ID,
    target_post_id: POST_ID,
    report_reason: "spam",
    report_details: null,
  });
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