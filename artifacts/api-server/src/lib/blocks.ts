import { supabaseUserRequest } from "./connectors";

/**
 * Members the signed-in member has blocked. Block checks are a courtesy
 * filter on top of the database's own restrictive policies, so a failed
 * lookup (for example before the blocks migration is applied) falls back to
 * "nobody blocked" instead of breaking the inbox or dog discovery.
 */
export async function blockedUserIds(
  userId: string,
  headers: Record<string, string>,
): Promise<Set<string>> {
  try {
    const response = await supabaseUserRequest(
      `/rest/v1/user_blocks?select=blocked_id&blocker_id=eq.${encodeURIComponent(userId)}`,
      { headers },
    );
    if (!response.ok) return new Set();
    const rows = (await response.json()) as { blocked_id?: unknown }[];
    return new Set(rows.map((row) => String(row.blocked_id)));
  } catch {
    return new Set();
  }
}

/** True when the signed-in member and otherUserId have blocked each other in either direction. */
export async function isBlockedWith(
  headers: Record<string, string>,
  otherUserId: string,
): Promise<boolean> {
  try {
    const response = await supabaseUserRequest("/rest/v1/rpc/is_blocked_with", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ other_user_id: otherUserId }),
    });
    if (!response.ok) return false;
    return (await response.json()) === true;
  } catch {
    return false;
  }
}
