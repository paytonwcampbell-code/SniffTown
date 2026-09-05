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