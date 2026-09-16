import type { ParkPackDetail } from "@workspace/api-client-react";

export const PARK_PACK_DETAIL_QUERY_SCOPE = "park-pack-detail";
export const PARK_PACK_MODERATION_QUERY_SCOPE = "park-pack-moderation";
export const PARK_PACK_MODERATORS_QUERY_SCOPE = "park-pack-moderators";

export function getParkListViewerQueryKey(viewerId: string | null) {
  return ["/api/parks", PARK_PACK_DETAIL_QUERY_SCOPE, viewerId ?? "anonymous"] as const;
}

export function getParkPackDetailViewerQueryKey(
  parkId: string,
  viewerId: string | null,
) {
  return [
    `/api/parks/${parkId}`,
    PARK_PACK_DETAIL_QUERY_SCOPE,
    viewerId ?? "anonymous",
  ] as const;
}

export function getParkPackModerationReportsViewerQueryKey(
  parkId: string,
  viewerId: string | null,
) {
  return [
    `/api/parks/${parkId}/moderation/reports`,
    PARK_PACK_MODERATION_QUERY_SCOPE,
    viewerId ?? "anonymous",
  ] as const;
}

export function getParkPackModeratorsViewerQueryKey(
  parkId: string,
  viewerId: string | null,
) {
  return [
    `/api/parks/${parkId}/moderators`,
    PARK_PACK_MODERATORS_QUERY_SCOPE,
    viewerId ?? "anonymous",
  ] as const;
}

export function isParkPackDetailViewerQueryKey(key: readonly unknown[]) {
  if (
    typeof key[0] !== "string" ||
    (key[0] !== "/api/parks" && !key[0].startsWith("/api/parks/"))
  ) {
    return false;
  }
  // Also recognize the old unscoped key so a hot-updated client cannot retain
  // a private response from the pre-viewer-scoped implementation. Moderation
  // reports are private too, so their viewer-scoped cache must be cleared on
  // account changes alongside park details.
  return (
    key.length === 1 ||
    (key.length === 3 &&
      (key[1] === PARK_PACK_DETAIL_QUERY_SCOPE ||
        key[1] === PARK_PACK_MODERATION_QUERY_SCOPE ||
        key[1] === PARK_PACK_MODERATORS_QUERY_SCOPE) &&
      typeof key[2] === "string")
  );
}

export function canRenderPrivateParkPackContent(
  viewerId: string | null,
  detail: ParkPackDetail | undefined,
) {
  return Boolean(
    viewerId &&
      detail?.isMember &&
      detail.members !== null &&
      detail.posts !== null,
  );
}