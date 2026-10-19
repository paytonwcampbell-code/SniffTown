import { Router, type IRouter, type Response } from "express";
import {
  CompleteEmailVerificationBody,
  CompleteEmailVerificationResponse,
  GetCurrentUserResponse,
  ResendVerificationEmailBody,
  ResendVerificationEmailResponse,
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
import { getAccessToken, isMobileClient } from "../lib/session-auth";

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
    secure: true,
    sameSite: "none" as const,
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

function clearSessionCookies(res: Response) {
  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
  };

  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
  res.clearCookie(USER_COOKIE, options);
}

function toCurrentUser(user?: SupabaseUser) {
  return {
    id: user?.id ?? null,
    email: user?.email ?? null,
    displayName:
      user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? null,
  };
}

function mobileTokens(req: Parameters<typeof isMobileClient>[0], auth: SupabaseAuthResult) {
  if (!isMobileClient(req)) return {};
  return {
    ...(auth.access_token ? { accessToken: auth.access_token } : {}),
    ...(auth.refresh_token ? { refreshToken: auth.refresh_token } : {}),
  };
}

const DEFAULT_SITE_URL = "https://snifftown.com";

/**
 * Where the email verification link should land. Browser sign-ups return to
 * the site they signed up on; the mobile app has no origin, so it uses the
 * public site. Supabase only honours URLs on its redirect allow list and falls
 * back to its configured Site URL otherwise.
 */
export function verificationRedirectUrl(req: { headers: Record<string, string | string[] | undefined> }): string {
  const header = req.headers.origin;
  const origin = Array.isArray(header) ? header[0] : header;
  const base =
    origin && /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin)
      ? origin
      : (process.env.SNIFFTOWN_SITE_URL?.trim() || DEFAULT_SITE_URL);
  return `${base.replace(/\/+$/, "")}/auth/verified`;
}

router.post("/auth/signup", async (req, res) => {
  const parsed = SignUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password." });
    return;
  }

  const response = await supabaseRequest(
    `/auth/v1/signup?redirect_to=${encodeURIComponent(verificationRedirectUrl(req))}`,
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
  setSessionCookies(res, auth);
  const result = SignUpResponse.parse({
    user: toCurrentUser(auth.user),
    requiresEmailVerification: !auth.access_token,
    message: auth.access_token
      ? "Your SniffTown account is ready."
      : "Check your email to verify your SniffTown account.",
      ...mobileTokens(req, auth),
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
  setSessionCookies(res, auth);
  res.json(
    SignInResponse.parse({
      user: toCurrentUser(auth.user),
      requiresEmailVerification: false,
      message: "Welcome back to SniffTown.",
      ...mobileTokens(req, auth),
    }),
  );
});

router.post("/auth/verified-session", async (req, res) => {
  const parsed = CompleteEmailVerificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "This verification link is incomplete." });
    return;
  }

  // Never trust the tokens from the address bar on their own: Supabase must
  // confirm the access token belongs to a real, verified member.
  const response = await supabaseUserRequest("/auth/v1/user", {
    headers: { Authorization: `Bearer ${parsed.data.accessToken}` },
  });
  if (!response.ok) {
    res.status(401).json({ error: "This verification link has expired. Sign in or request a new link." });
    return;
  }

  const user = (await response.json()) as SupabaseUser;
  setSessionCookies(res, {
    access_token: parsed.data.accessToken,
    refresh_token: parsed.data.refreshToken,
    user,
  });
  res.json(
    CompleteEmailVerificationResponse.parse({
      user: toCurrentUser(user),
      requiresEmailVerification: false,
      message: "Your email is verified. Welcome to SniffTown!",
    }),
  );
});

router.post("/auth/resend-verification", async (req, res) => {
  const parsed = ResendVerificationEmailBody.safeParse(req.body);
  const email = parsed.success ? parsed.data.email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  const response = await supabaseRequest(
    `/auth/v1/resend?redirect_to=${encodeURIComponent(verificationRedirectUrl(req))}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "signup", email }),
    },
  );
  if (response.status === 429) {
    res.status(429).json({ error: "Please wait a minute before requesting another link." });
    return;
  }
  if (!response.ok) {
    // Do not reveal whether the address belongs to an account.
    req.log.warn({ providerError: await readProviderError(response) }, "Supabase did not resend verification email");
  }
  res.status(202).json(
    ResendVerificationEmailResponse.parse({
      message: "If that email has an account waiting to be verified, a new link is on its way.",
    }),
  );
});

router.post("/auth/signout", async (req, res) => {
  const token = getAccessToken(req);
  if (token) {
    await supabaseUserRequest("/auth/v1/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  clearSessionCookies(res);
  res.status(204).send();
});

router.delete("/auth/account", async (req, res) => {
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: "Sign in to delete your account." });
    return;
  }

  try {
    const response = await supabaseUserRequest("/rest/v1/rpc/delete_my_account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!response.ok) {
      const error = await readProviderError(response);
      if (response.status === 401) {
        res.status(401).json({ error: "Sign in again to delete your account." });
        return;
      }
      req.log.error({ providerError: error }, "Supabase rejected account deletion");
      res.status(502).json({ error: "We could not delete your account right now. Nothing was removed." });
      return;
    }
  } catch (error) {
    req.log.error({ err: error }, "Unable to delete account");
    res.status(502).json({ error: "We could not delete your account right now. Nothing was removed." });
    return;
  }

  clearSessionCookies(res);
  res.status(204).send();
});

router.post("/auth/refresh", async (req, res) => {
  if (!isMobileClient(req)) {
    res.status(400).json({ error: "Native session refresh requires the mobile client header." });
    return;
  }
  const refreshToken = typeof req.body?.refreshToken === "string"
    ? req.body.refreshToken.trim()
    : "";
  if (!refreshToken) {
    res.status(400).json({ error: "A refresh token is required." });
    return;
  }

  const response = await supabaseRequest("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) {
    res.status(response.status === 400 ? 401 : response.status).json({
      error: await readProviderError(response),
    });
    return;
  }

  const auth = (await response.json()) as SupabaseAuthResult;
  if (!auth.access_token || !auth.refresh_token) {
    res.status(401).json({ error: "Unable to refresh your session." });
    return;
  }
  setSessionCookies(res, auth);
  res.json(
    SignInResponse.parse({
      user: toCurrentUser(auth.user),
      requiresEmailVerification: false,
      message: "Your SniffTown session has been refreshed.",
      ...mobileTokens(req, auth),
    }),
  );
});

router.get("/auth/me", async (req, res) => {
  const token = getAccessToken(req);
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

  if (!response.ok) {
    clearSessionCookies(res);
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
  res.json(
    GetCurrentUserResponse.parse(
      toCurrentUser(user),
    ),
  );
});

export default router;