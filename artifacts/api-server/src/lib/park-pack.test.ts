import assert from "node:assert/strict";
import test from "node:test";
import {
  canViewPrivateParkPack,
  isPackMembershipUniqueConflict,
  moderatorManagementProviderError,
  moderationProviderError,
  normalizeParkPackPostBody,
  serializeParkPackModerationReport,
  serializeParkPackMember,
  serializeParkPackModerator,
  serializeParkPackPost,
} from "./park-pack.ts";

test("requires a current viewer before exposing private park-pack content", () => {
  assert.equal(canViewPrivateParkPack(null, true, true), false);
  assert.equal(canViewPrivateParkPack("member-1", false, true), true);
  assert.equal(canViewPrivateParkPack("creator-1", true, false), true);
});

test("trims park-pack post content before the schema length check", () => {
  assert.deepEqual(
    normalizeParkPackPostBody({ content: "  Sunrise walk tomorrow?  " }),
    { content: "Sunrise walk tomorrow?" },
  );
  assert.deepEqual(normalizeParkPackPostBody({ content: "   " }), { content: "" });
});

test("recognizes only the membership unique-key conflict for an idempotent join retry", () => {
  assert.equal(
    isPackMembershipUniqueConflict(409, {
      code: "23505",
      constraint: "pack_members_pack_id_user_id_key",
      details: "Key (pack_id, user_id) already exists.",
    }),
    true,
  );
  assert.equal(
    isPackMembershipUniqueConflict(409, {
      code: "23505",
      details: "Key (name) already exists.",
    }),
    false,
  );
  assert.equal(
    isPackMembershipUniqueConflict(400, {
      code: "23505",
      details: "Key (pack_id, user_id) already exists.",
    }),
    false,
  );
});

test("serializes dog-linked park-pack members without contact fields", () => {
  assert.deepEqual(
    serializeParkPackMember({
      id: "dog-1",
      user_id: "member-1",
      name: "Mochi",
      photo_url: null,
    }),
    { dogId: "dog-1", dogName: "Mochi", dogPhotoUrl: null },
  );
});

test("links a board post to the author's dog and marks own posts", () => {
  assert.deepEqual(
    serializeParkPackPost(
      {
        id: "post-1",
        author_id: "member-1",
        content: "Sunrise walk tomorrow?",
        created_at: "2026-03-06T08:00:00.000Z",
        author_display_name: "Alex A.",
        dog_name: "Mochi",
        dog_photo_url: "https://example.test/mochi.jpg",
      },
      [{ id: "dog-1", user_id: "member-1", name: "Mochi", photo_url: null }],
      "member-1",
    ),
    {
      id: "post-1",
      content: "Sunrise walk tomorrow?",
      createdAt: "2026-03-06T08:00:00.000Z",
      authorDisplayName: "Alex A.",
      dogId: "dog-1",
      dogName: "Mochi",
      dogPhotoUrl: "https://example.test/mochi.jpg",
      isMine: true,
    },
  );
});

test("maps report limits, duplicates, and membership errors to explicit safe responses", () => {
  assert.deepEqual(
    moderationProviderError("Report rate limit reached. Try again in an hour.", "report"),
    {
      status: 429,
      message: "You have reached the report limit. Try again in an hour.",
    },
  );
  assert.deepEqual(
    moderationProviderError("You have already reported this post.", "report"),
    { status: 409, message: "You have already reported this post." },
  );
  assert.deepEqual(
    moderationProviderError("Join this park pack before reporting posts.", "report"),
    { status: 403, message: "Join this park pack before reporting posts." },
  );
});

test("does not expose reporter identity in moderation report serialization", () => {
  assert.deepEqual(
    serializeParkPackModerationReport({
      id: "report-1",
      post_id: "post-1",
      post_content: "Repeated promotion",
      author_display_name: "Alex A.",
      reason: "spam",
      details: "Seen several times.",
      reporter_id: "must-not-leak",
      reporter_email: "must-not-leak@example.test",
      created_at: "2026-09-16T10:00:00.000Z",
    }),
    {
      id: "report-1",
      postId: "post-1",
      postContent: "Repeated promotion",
      authorDisplayName: "Alex A.",
      reason: "spam",
      details: "Seen several times.",
      createdAt: "2026-09-16T10:00:00.000Z",
    },
  );
});

test("serializes park-pack moderator members without contact fields", () => {
  assert.deepEqual(
    serializeParkPackModerator({
      user_id: "member-1",
      display_name: "Alex A.",
      is_moderator: true,
      email: "must-not-leak@example.test",
    }),
    {
      userId: "member-1",
      displayName: "Alex A.",
      isModerator: true,
    },
  );
});

test("maps moderator management authorization errors explicitly", () => {
  assert.deepEqual(
    moderatorManagementProviderError(
      "Only a current pack creator can manage moderators.",
    ),
    {
      status: 403,
      message: "Only this pack's current creator can manage moderators.",
    },
  );
  assert.deepEqual(
    moderatorManagementProviderError(
      "The selected user is not a current park-pack member.",
    ),
    {
      status: 404,
      message: "That user is not a current member of this park pack.",
    },
  );
  assert.deepEqual(
    moderatorManagementProviderError("Pack creators are always moderators."),
    {
      status: 409,
      message: "Pack creators are always moderators.",
    },
  );
});