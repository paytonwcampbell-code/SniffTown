import { describe, expect, it } from "vitest";
import {
  canRenderPrivateParkPackContent,
  deriveParkPackMembershipView,
} from "../lib/park-pack";

const detail = (overrides = {}) => ({
  id: "park-1",
  name: "Neighborhood Park",
  city: "Austin",
  state: "TX",
  slug: "neighborhood-park",
  address: "123 Test St",
  description: null,
  offLeash: false,
  communityCreated: true,
  memberCount: 1,
  isMember: false,
  isCreator: false,
  members: null,
  posts: null,
  ...overrides,
});

describe("park-pack membership view", () => {
  it("waits for the viewer-scoped detail before deciding membership", () => {
    expect(deriveParkPackMembershipView("user-1", undefined)).toBe("loading");
    expect(deriveParkPackMembershipView("user-1", detail())).toBe("nonmember");
  });

  it("only treats a complete private response as the member board", () => {
    expect(
      deriveParkPackMembershipView(
        "user-1",
        detail({ isMember: true, members: [], posts: [] }),
      ),
    ).toBe("member");
    expect(
      deriveParkPackMembershipView(
        "user-1",
        detail({ isMember: true, members: [], posts: null }),
      ),
    ).toBe("loading");
  });

  it("keeps private content gated for a logged-out viewer", () => {
    const privateDetail = detail({ isMember: true, members: [], posts: [] });
    expect(deriveParkPackMembershipView(null, privateDetail)).toBe("nonmember");
    expect(canRenderPrivateParkPackContent(null, privateDetail)).toBe(false);
  });

  it("does not revoke a same-viewer board just because its query is refreshing", () => {
    const privateDetail = detail({ isMember: true, members: [], posts: [] });
    expect(deriveParkPackMembershipView("user-1", privateDetail)).toBe("member");
    expect(canRenderPrivateParkPackContent("user-1", privateDetail)).toBe(true);
  });
});