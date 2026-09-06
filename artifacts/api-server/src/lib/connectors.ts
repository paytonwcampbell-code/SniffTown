import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

type ConnectorRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export async function supabaseRequest(
  path: string,
  init: ConnectorRequestInit = {},
): Promise<Response> {
  return connectors.proxy("supabase", path, init);
}

export async function supabaseUserRequest(
  path: string,
  init: ConnectorRequestInit = {},
): Promise<Response> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Authenticated Supabase access is not configured.");
  }

  return fetch(`${url.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: {
      apikey: anonKey,
      ...init.headers,
    },
  });
}

export async function resendRequest(
  path: string,
  init: ConnectorRequestInit = {},
): Promise<Response> {
  return connectors.proxy("resend", path, init);
}

export async function readProviderError(response: Response): Promise<string> {
  const body = await response.text();

  if (!body) {
    return `${response.status} ${response.statusText}`.trim();
  }

  try {
    const parsed = JSON.parse(body) as {
      message?: string;
      error_description?: string;
      error?: string;
    };
    return (
      parsed.message ??
      parsed.error_description ??
      parsed.error ??
      `${response.status} ${response.statusText}`.trim()
    );
  } catch {
    return body;
  }
}