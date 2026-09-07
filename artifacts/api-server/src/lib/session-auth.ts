import type { Request } from "express";

const ACCESS_COOKIE = "snifftown_access";

/**
 * Returns the session token supplied by a native bearer session, falling back
 * to the httpOnly browser session cookie. Bearer credentials deliberately win
 * so a mobile request never depends on cookie handling.
 */
export function getAccessToken(req: Pick<Request, "headers" | "cookies">): string | null {
  const authorization = req.headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  const match = value?.match(/^\s*Bearer\s+(.+?)\s*$/i);
  if (match?.[1]) return match[1];

  const cookie = req.cookies?.[ACCESS_COOKIE];
  return typeof cookie === "string" && cookie.trim() ? cookie : null;
}

/**
 * This is explicit session content negotiation. The normal web application
 * does not send this header and therefore continues to receive only httpOnly
 * cookie sessions; callers that opt in receive a native bearer session.
 */
export function isMobileClient(req: Pick<Request, "headers">): boolean {
  const value = req.headers["x-snifftown-client"];
  const client = Array.isArray(value) ? value[0] : value;
  return client?.trim().toLowerCase() === "mobile";
}