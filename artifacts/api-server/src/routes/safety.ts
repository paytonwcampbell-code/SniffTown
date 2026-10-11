import { Router, type IRouter, type Request } from "express";
import {
  BlockMemberParams,
  ListBlockedMembersResponse,
  ReportMemberBody,
  ReportMemberParams,
  ReportMemberResponse,
  UnblockMemberParams,
} from "@workspace/api-zod";
import { resendRequest, supabaseUserRequest } from "../lib/connectors";
import { getAccessToken } from "../lib/session-auth";

const router: IRouter = Router();

type Row = Record<string, unknown>;

type AuthenticatedUser = {
  id: string;
  headers: Record<string, string>;
};

const REPORT_REASON_LABELS: Record<string, string> = {
  spam: "Spam or scam",
  harassment: "Harassment or bullying",
  unsafe: "Unsafe behavior",
  inappropriate: "Inappropriate content",
  other: "Something else",
};

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
  next();
});

async function getAuthenticatedUser(
  req: Request,
): Promise<AuthenticatedUser | null> {
  const token = getAccessToken(req);
  if (!token) {
    return null;
  }

  const response = await supabaseUserRequest("/auth/v1/user", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    return null;
  }

  const user = (await response.json()) as { id?: unknown };
  if (typeof user.id !== "string") {
    return null;
  }

  return { id: user.id, headers: { Authorization: `Bearer ${token}` } };
}

async function readPostgrestError(
  response: Response,
): Promise<{ code: string | null; message: string }> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { code?: unknown; message?: unknown };
    return {
      code: typeof parsed.code === "string" ? parsed.code : null,
      message:
        typeof parsed.message === "string"
          ? parsed.message
          : body || response.statusText,
    };
  } catch {
    return { code: null, message: body || response.statusText };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Lets the SniffTown team know a member report is waiting. The report itself
 * is already stored in Supabase; this email is a best-effort heads-up and is
 * skipped when no moderation inbox is configured.
 */
async function notifyModerationInbox(
  req: Request,
  report: {
    reportId: string;
    reporterId: string;
    reportedUserId: string;
    context: string;
    reason: string;
    details: string | null;
  },
) {
  const inbox = process.env.SNIFFTOWN_MODERATION_EMAIL?.trim();
  if (!inbox) {
    return;
  }

  try {
    const response = await resendRequest("/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "SniffTown <onboarding@resend.dev>",
        to: [inbox],
        subject: `New SniffTown member report: ${REPORT_REASON_LABELS[report.reason] ?? report.reason}`,
        html: `<div style="font-family:Arial,sans-serif;color:#2d2924"><h2>A member report needs review</h2><p><strong>Reason:</strong> ${escapeHtml(REPORT_REASON_LABELS[report.reason] ?? report.reason)}<br/><strong>Where:</strong> ${escapeHtml(report.context === "conversation" ? "Private messages" : "Dog profile")}<br/><strong>Reported member:</strong> ${escapeHtml(report.reportedUserId)}<br/><strong>Reported by:</strong> ${escapeHtml(report.reporterId)}<br/><strong>Report ID:</strong> ${escapeHtml(report.reportId)}</p>${report.details ? `<blockquote style="border-left:3px solid #d99500;padding-left:16px;color:#6f665c">${escapeHtml(report.details)}</blockquote>` : ""}<p>Review it in Supabase under <code>user_reports</code>. App Store rules expect action within 24 hours.</p></div>`,
      }),
    });
    if (!response.ok) {
      req.log.error(
        { status: response.status },
        "Resend rejected moderation email",
      );
    }
  } catch (error) {
    req.log.error({ err: error }, "Unable to send moderation email");
  }
}

router.get("/blocks", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to manage blocked members." });
      return;
    }

    const response = await supabaseUserRequest(
      `/rest/v1/user_blocks?select=blocked_id,created_at&blocker_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc`,
      { headers: user.headers },
    );
    if (!response.ok) {
      throw new Error("Supabase request failed.");
    }
    const rows = (await response.json()) as Row[];
    res.json(
      ListBlockedMembersResponse.parse(
        rows.map((row) => ({
          userId: String(row.blocked_id),
          blockedAt: String(row.created_at),
        })),
      ),
    );
  } catch (error) {
    req.log.error({ err: error }, "Unable to list blocked members");
    res
      .status(502)
      .json({ error: "Unable to load blocked members right now." });
  }
});

router.put("/users/:userId/block", async (req, res) => {
  const params = BlockMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid member." });
    return;
  }

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to block a member." });
      return;
    }
    if (params.data.userId === user.id) {
      res.status(400).json({ error: "You cannot block yourself." });
      return;
    }

    const response = await supabaseUserRequest(
      "/rest/v1/user_blocks?on_conflict=blocker_id,blocked_id",
      {
        method: "POST",
        headers: {
          ...user.headers,
          "Content-Type": "application/json",
          Prefer: "resolution=ignore-duplicates,return=minimal",
        },
        body: JSON.stringify({
          blocker_id: user.id,
          blocked_id: params.data.userId,
        }),
      },
    );
    if (!response.ok) {
      const error = await readPostgrestError(response);
      if (error.code === "23503") {
        res
          .status(404)
          .json({ error: "That member is no longer on SniffTown." });
        return;
      }
      throw new Error(error.message);
    }
    res.status(204).send();
  } catch (error) {
    req.log.error({ err: error }, "Unable to block member");
    res.status(502).json({ error: "Unable to block this member right now." });
  }
});

router.delete("/users/:userId/block", async (req, res) => {
  const params = UnblockMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid member." });
    return;
  }

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to unblock a member." });
      return;
    }

    const response = await supabaseUserRequest(
      `/rest/v1/user_blocks?blocker_id=eq.${encodeURIComponent(user.id)}&blocked_id=eq.${encodeURIComponent(params.data.userId)}`,
      { method: "DELETE", headers: user.headers },
    );
    if (!response.ok) {
      throw new Error("Supabase request failed.");
    }
    res.status(204).send();
  } catch (error) {
    req.log.error({ err: error }, "Unable to unblock member");
    res.status(502).json({ error: "Unable to unblock this member right now." });
  }
});

router.post("/users/:userId/reports", async (req, res) => {
  const params = ReportMemberParams.safeParse(req.params);
  const body = ReportMemberBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose a reason for your report." });
    return;
  }

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to report a member." });
      return;
    }

    const details = body.data.details?.trim() || null;
    const response = await supabaseUserRequest("/rest/v1/rpc/report_user", {
      method: "POST",
      headers: { ...user.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        target_user_id: params.data.userId,
        report_context: body.data.context,
        report_reason: body.data.reason,
        report_details: details,
      }),
    });
    if (!response.ok) {
      const error = await readPostgrestError(response);
      const status =
        error.code === "42501"
          ? 401
          : error.code === "P0002"
            ? 404
            : error.code === "54000"
              ? 429
              : error.code === "22023"
                ? 400
                : 502;
      res.status(status).json({
        error:
          status === 502
            ? "Unable to submit this report right now."
            : error.message,
      });
      return;
    }

    const row = ((await response.json()) as Row[])[0];
    if (!row?.report_id) {
      res.status(502).json({ error: "The report could not be saved." });
      return;
    }
    const reportId = String(row.report_id);
    await notifyModerationInbox(req, {
      reportId,
      reporterId: user.id,
      reportedUserId: params.data.userId,
      context: body.data.context,
      reason: body.data.reason,
      details,
    });
    res.status(201).json(
      ReportMemberResponse.parse({
        reportId,
        status: String(row.status ?? "open"),
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Unable to report member");
    res.status(502).json({ error: "Unable to submit this report right now." });
  }
});

export default router;
