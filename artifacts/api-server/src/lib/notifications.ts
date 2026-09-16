type NotificationRow = Record<string, unknown>;

const PARK_POST_REPORT_TYPE = "park_post_report" as const;
const MODERATION_SCREEN = "moderation" as const;

export function serializeNotification(row: NotificationRow) {
  const rawData =
    row.data && typeof row.data === "object" && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : {};
  const createdAt =
    typeof row.created_at === "string"
      ? row.created_at
      : new Date(0).toISOString();

  // The database RPC is intentionally narrow, but keep this serializer
  // allowlisted as a second privacy boundary before data reaches a client.
  return {
    id: String(row.id),
    type: PARK_POST_REPORT_TYPE,
    title: "Park pack post needs review",
    body: "A new report is waiting in the moderation queue.",
    data: {
      parkId: String(rawData.parkId),
      packId: String(rawData.packId),
      screen: MODERATION_SCREEN,
    },
    createdAt,
    revision: createdAt,
    readAt: typeof row.read_at === "string" ? row.read_at : null,
  };
}

export function serializeNotificationRead(row: NotificationRow) {
  return {
    success: true,
    notificationId: String(row.id),
    readAt: typeof row.read_at === "string" ? row.read_at : null,
  };
}