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