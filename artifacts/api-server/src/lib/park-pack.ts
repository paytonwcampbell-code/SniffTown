export type ParkPackDogRow = {
  id?: unknown;
  user_id?: unknown;
  name?: unknown;
  photo_url?: unknown;
};

export function canViewPrivateParkPack(
  currentUserId: string | null,
  isCreator: boolean,
  hasMembership: boolean,
) {
  return Boolean(currentUserId && (isCreator || hasMembership));
}

export function normalizeParkPackPostBody(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const body = value as Record<string, unknown>;
  return typeof body.content === "string"
    ? { ...body, content: body.content.trim() }
    : body;
}

export function isPackMembershipUniqueConflict(
  status: number,
  body: unknown,
) {
  if (status !== 409 || !body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  if (record.code !== "23505") return false;
  const details = [record.constraint, record.details, record.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return details.includes("pack_id") && details.includes("user_id");
}

export function moderationProviderError(
  providerMessage: string,
  operation: "report" | "moderation",
) {
  const message = providerMessage.toLowerCase();
  if (message.includes("rate limit")) {
    return {
      status: 429,
      message: "You have reached the report limit. Try again in an hour.",
    };
  }
  if (message.includes("already reported")) {
    return { status: 409, message: "You have already reported this post." };
  }
  if (message.includes("not found")) {
    return {
      status: 404,
      message:
        operation === "report"
          ? "This visible park-pack post was not found."
          : "This open moderation report was not found.",
    };
  }
  if (
    message.includes("only park-pack moderators") ||
    message.includes("join this park pack")
  ) {
    return {
      status: 403,
      message:
        operation === "report"
          ? "Join this park pack before reporting posts."
          : "Only this pack's creator or moderators can review reports.",
    };
  }
  if (message.includes("your own park-pack post")) {
    return { status: 400, message: "You cannot report your own park-pack post." };
  }
  return {
    status: 502,
    message:
      operation === "report"
        ? "Unable to submit this report right now."
        : "Unable to save this moderation action right now.",
  };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function serializeParkPackMember(row: ParkPackDogRow) {
  return {
    dogId: String(row.id),
    dogName: text(row.name) ?? "Neighborhood dog",
    dogPhotoUrl: text(row.photo_url),
  };
}

export function serializeParkPackModerationReport(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    postId: String(row.post_id),
    postContent: text(row.post_content) ?? "",
    authorDisplayName: text(row.author_display_name) ?? "Pack Member",
    reason: String(row.reason),
    details: text(row.details),
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date(0).toISOString(),
  };
}

export function serializeParkPackModerator(row: Record<string, unknown>) {
  return {
    userId: String(row.user_id),
    displayName:
      typeof row.display_name === "string" && row.display_name.trim()
        ? row.display_name
        : "Pack Member",
    isModerator: Boolean(row.is_moderator),
  };
}

export function moderatorManagementProviderError(
  providerMessage: string,
) {
  const message = providerMessage.toLowerCase();
  if (message.includes("only a current pack creator")) {
    return {
      status: 403,
      message: "Only this pack's current creator can manage moderators.",
    };
  }
  if (message.includes("not a current park-pack member")) {
    return {
      status: 404,
      message: "That user is not a current member of this park pack.",
    };
  }
  if (message.includes("always moderators")) {
    return {
      status: 409,
      message: "Pack creators are always moderators.",
    };
  }
  return {
    status: 502,
    message: "Unable to update park-pack moderators right now.",
  };
}

export function serializeParkPackPost(
  row: Record<string, unknown>,
  memberDogs: ParkPackDogRow[],
  currentUserId: string,
) {
  const authorId = text(row.author_id);
  const dog = memberDogs.find((candidate) => text(candidate.user_id) === authorId);
  const dogId = text(dog?.id);

  return {
    id: String(row.id),
    content: text(row.content) ?? "",
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date(0).toISOString(),
    authorDisplayName: text(row.author_display_name) ?? "Pack Member",
    dogId,
    dogName: text(row.dog_name) ?? text(dog?.name),
    dogPhotoUrl: text(row.dog_photo_url) ?? text(dog?.photo_url),
    isMine: authorId === currentUserId,
  };
}