import { Router, type IRouter, type Response } from "express";
import {
  GetCurrentUserResponse,
  SignInBody,
  SignInResponse,
  SignUpBody,
  SignUpResponse,
} from "@workspace/api-zod";
import {
  readProviderError,
  supabaseRequest,
  supabaseUserRequest,
} from "../lib/connectors";

const router: IRouter = Router();
const ACCESS_COOKIE = "snifftown_access";
const REFRESH_COOKIE = "snifftown_refresh";
const USER_COOKIE = "snifftown_user_id";

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
  next();
});

type SupabaseUser = {
  id?: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string };
};

type SupabaseAuthResult = {
  access_token?: string;
  refresh_token?: string;
  user?: SupabaseUser;
};

function setSessionCookies(res: Response, auth: SupabaseAuthResult) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };

  if (auth.access_token) {
    res.cookie(ACCESS_COOKIE, auth.access_token, {
      ...options,
      maxAge: 60 * 60 * 1000,
    });
  }
  if (auth.refresh_token) {
    res.cookie(REFRESH_COOKIE, auth.refresh_token, {
      ...options,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
  if (auth.user?.id) {
    res.cookie(USER_COOKIE, auth.user.id, {
      ...options,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}

function toCurrentUser(user?: SupabaseUser) {
  return {
    id: user?.id ?? null,
    email: user?.email ?? null,
    displayName:
      user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? null,
  };
}

router.post("/auth/signup", async (req, res) => {
  const parsed = SignUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password." });
    return;
  }

  const response = await supabaseRequest("/auth/v1/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  if (!response.ok) {
    res.status(response.status).json({ error: await readProviderError(response) });
    return;
  }

  const auth = (await response.json()) as SupabaseAuthResult;
  setSessionCookies(res, auth);
  const result = SignUpResponse.parse({
    user: toCurrentUser(auth.user),
    requiresEmailVerification: !auth.access_token,
    message: auth.access_token
      ? "Your SniffTown account is ready."
      : "Check your email to verify your SniffTown account.",
  });
  res.status(201).json(result);
});

router.post("/auth/signin", async (req, res) => {
  const parsed = SignInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password." });
    return;
  }

  const response = await supabaseRequest(
    "/auth/v1/token?grant_type=password",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    },
  );

  if (!response.ok) {
    res.status(response.status).json({ error: await readProviderError(response) });
    return;
  }

  const auth = (await response.json()) as SupabaseAuthResult;
  let immediateSessionStatus: number | null = null;
  if (auth.access_token) {
    const sessionCheck = await supabaseUserRequest("/auth/v1/user", {
      headers: { Authorization: `Bearer ${auth.access_token}` },
    });
    immediateSessionStatus = sessionCheck.status;
  }
  req.log.info(
    {
      hasAccessToken: Boolean(auth.access_token),
      accessTokenLength: auth.access_token?.length ?? 0,
      hasRefreshToken: Boolean(auth.refresh_token),
      hasUserId: Boolean(auth.user?.id),
      immediateSessionStatus,
    },
    "Supabase sign-in session received",
  );
  setSessionCookies(res, auth);
  res.json(
    SignInResponse.parse({
      user: toCurrentUser(auth.user),
      requiresEmailVerification: false,
      message: "Welcome back to SniffTown.",
    }),
  );
});

router.post("/auth/signout", async (req, res) => {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (token) {
    await supabaseUserRequest("/auth/v1/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  res.clearCookie(ACCESS_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_COOKIE, { path: "/" });
  res.clearCookie(USER_COOKIE, { path: "/" });
  res.status(204).send();
});

router.get("/auth/me", async (req, res) => {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (!token) {
    res.json(
      GetCurrentUserResponse.parse({
        id: null,
        email: null,
        displayName: null,
      }),
    );
    return;
  }

  const response = await supabaseUserRequest("/auth/v1/user", {
    headers: { Authorization: `Bearer ${token}` },
  });
  req.log.info(
    {
      hasSessionCookie: true,
      sessionCookieLength: token.length,
      providerStatus: response.status,
    },
    "Supabase current-user check completed",
  );

  if (!response.ok) {
    res.clearCookie(ACCESS_COOKIE, { path: "/" });
    res.clearCookie(REFRESH_COOKIE, { path: "/" });
    res.clearCookie(USER_COOKIE, { path: "/" });
    res.json(
      GetCurrentUserResponse.parse({
        id: null,
        email: null,
        displayName: null,
      }),
    );
    return;
  }

  const user = (await response.json()) as SupabaseUser;
  req.log.info(
    { hasUserId: Boolean(user.id) },
    "Supabase current-user response received",
  );
  res.json(
    GetCurrentUserResponse.parse(
      toCurrentUser(user),
    ),
  );
});

export default router;