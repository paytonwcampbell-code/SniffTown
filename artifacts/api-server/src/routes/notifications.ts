import { Router, type IRouter } from "express";
import {
  ListNotificationsResponse,
  MarkNotificationReadBody,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
} from "@workspace/api-zod";
import { readProviderError, supabaseUserRequest } from "../lib/connectors";
import { getAccessToken } from "../lib/session-auth";
import {
  serializeNotification,
  serializeNotificationRead,
} from "../lib/notifications";

const router: IRouter = Router();
type Row = Record<string, unknown>;

function privateResponse(res: {
  setHeader: (name: string, value: string) => void;
}) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
}

function providerStatus(status: number, message: string, operation: "list" | "read") {
  if (status === 401 || message.toLowerCase().includes("sign in")) {
    return {
      status: 401,
      message:
        operation === "list"
          ? "Sign in to view notifications."
          : "Sign in to update notifications.",
    };
  }
  if (message.toLowerCase().includes("not found")) {
    return { status: 404, message: "Notification not found." };
  }
  return {
    status: 502,
    message:
      operation === "list"
        ? "Unable to load notifications right now."
        : "Unable to update this notification right now.",
  };
}

router.use((_req, res, next) => {
  privateResponse(res);
  next();
});

router.get("/notifications", async (req, res) => {
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: "Sign in to view notifications." });
    return;
  }

  try {
    const response = await supabaseUserRequest(
      "/rest/v1/rpc/list_notifications",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target_limit: 100 }),
      },
    );
    if (!response.ok) {
      const mapped = providerStatus(
        response.status,
        await readProviderError(response),
        "list",
      );
      res.status(mapped.status).json({ error: mapped.message });
      return;
    }

    const rows = (await response.json()) as Row[];
    res.json(
      ListNotificationsResponse.parse(rows.map(serializeNotification)),
    );
  } catch (error) {
    req.log.error({ err: error }, "Unable to load notifications");
    res.status(502).json({ error: "Unable to load notifications right now." });
  }
});

router.post("/notifications/:notificationId/read", async (req, res) => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  const body = MarkNotificationReadBody.safeParse(req.body);
  const token = getAccessToken(req);
  if (!token) {
    res.status(401).json({ error: "Sign in to update notifications." });
    return;
  }
  if (!params.success || !body.success) {
    res.status(400).json({
      error: "Provide the notification's observed revision.",
    });
    return;
  }

  try {
    const response = await supabaseUserRequest(
      "/rest/v1/rpc/mark_notification_read",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target_notification_id: params.data.notificationId,
          target_created_at: body.data.revision,
        }),
      },
    );
    if (!response.ok) {
      const mapped = providerStatus(
        response.status,
        await readProviderError(response),
        "read",
      );
      res.status(mapped.status).json({ error: mapped.message });
      return;
    }

    const row = ((await response.json()) as Row[])[0];
    if (!row?.id) {
      res.status(502).json({ error: "The notification could not be updated." });
      return;
    }
    res.json(MarkNotificationReadResponse.parse(serializeNotificationRead(row)));
  } catch (error) {
    req.log.error({ err: error }, "Unable to update notification");
    res.status(502).json({ error: "Unable to update this notification right now." });
  }
});

export default router;