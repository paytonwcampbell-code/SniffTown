import { Router, type IRouter } from "express";
import {
  SendContactMessageBody,
  SendContactMessageResponse,
} from "@workspace/api-zod";
import { readProviderError, resendRequest } from "../lib/connectors";

const router: IRouter = Router();

router.post("/contact", async (req, res) => {
  const parsed = SendContactMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please complete every contact field." });
    return;
  }

  const response = await resendRequest("/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "SniffTown <onboarding@resend.dev>",
      to: [parsed.data.email],
      subject: "We received your SniffTown message",
      html: `<div style="font-family:Arial,sans-serif;color:#2d2924"><h2>Thanks for reaching out, ${parsed.data.name}.</h2><p>We received your message and will get back to you soon.</p><blockquote style="border-left:3px solid #d99500;padding-left:16px;color:#6f665c">${parsed.data.message}</blockquote><p>— The SniffTown team</p></div>`,
    }),
  });

  if (!response.ok) {
    req.log.error(
      { providerError: await readProviderError(response) },
      "Resend rejected contact email",
    );
    res.status(502).json({ error: "We could not send your message right now." });
    return;
  }

  res.status(202).json(
    SendContactMessageResponse.parse({
      accepted: true,
      message: "Thanks — your message is on its way.",
    }),
  );
});

export default router;