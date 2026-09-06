import { Router, type IRouter, type Request } from "express";
import {
  ListConversationsResponse,
  ListMessagesParams,
  ListMessagesResponse,
  MarkConversationReadParams,
  MarkConversationReadResponse,
  SendMessageBody,
  SendMessageResponse,
} from "@workspace/api-zod";
import { supabaseUserRequest } from "../lib/connectors";

const router: IRouter = Router();
const ACCESS_COOKIE = "snifftown_access";

type Row = Record<string, unknown>;

type AuthenticatedUser = {
  id: string;
  headers: Record<string, string>;
};

const pairLocks = new Map<string, Promise<void>>();

async function withPairLock<T>(
  pairKey: string,
  action: () => Promise<T>,
): Promise<T> {
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const previous = pairLocks.get(pairKey) ?? Promise.resolve();
  const queued = previous.then(() => current);
  pairLocks.set(pairKey, queued);

  await previous;
  try {
    return await action();
  } finally {
    releaseCurrent();
    if (pairLocks.get(pairKey) === queued) {
      pairLocks.delete(pairKey);
    }
  }
}

function privateResponse(res: { setHeader: (name: string, value: string) => void }) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
}

async function getAuthenticatedUser(
  req: Request,
): Promise<AuthenticatedUser | null> {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
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

async function userRows(
  path: string,
  headers: Record<string, string>,
): Promise<Row[]> {
  const response = await supabaseUserRequest(path, { headers });
  if (!response.ok) {
    throw new Error("Supabase request failed.");
  }
  return (await response.json()) as Row[];
}

async function findConversation(
  conversationId: string,
  headers: Record<string, string>,
): Promise<Row | null> {
  const rows = await userRows(
    `/rest/v1/conversations?select=id,participant_1_id,participant_2_id,last_message_at,created_at&id=eq.${encodeURIComponent(conversationId)}&limit=1`,
    headers,
  );
  return rows[0] ?? null;
}

function isParticipant(conversation: Row, userId: string): boolean {
  return (
    conversation.participant_1_id === userId ||
    conversation.participant_2_id === userId
  );
}

function otherParticipant(conversation: Row, userId: string): string {
  return conversation.participant_1_id === userId
    ? String(conversation.participant_2_id)
    : String(conversation.participant_1_id);
}

function toMessage(row: Row) {
  return {
    id: String(row.id),
    senderId: String(row.sender_id),
    receiverId: String(row.receiver_id),
    content: String(row.content),
    readAt: typeof row.read_at === "string" ? row.read_at : null,
    createdAt: String(row.created_at),
  };
}

router.use((_req, res, next) => {
  privateResponse(res);
  next();
});

router.get("/conversations", async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to view conversations." });
      return;
    }

    const response = await supabaseUserRequest(
      "/rest/v1/rpc/get_user_conversations",
      {
        method: "POST",
        headers: {
          ...user.headers,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );
    if (!response.ok) {
      throw new Error("Supabase request failed.");
    }
    const rows = (await response.json()) as Row[];
    const conversations = rows.map((row) => ({
      id: String(row.id),
      participant1Id: String(row.participant_1_id),
      participant2Id: String(row.participant_2_id),
      lastMessageAt:
        typeof row.last_message_at === "string" ? row.last_message_at : null,
      createdAt: String(row.created_at),
      otherDogName:
        typeof row.other_dog_name === "string" ? row.other_dog_name : null,
      otherOwnerName:
        typeof row.other_owner_name === "string" ? row.other_owner_name : null,
      otherDogPhotoUrl:
        typeof row.other_dog_photo_url === "string"
          ? row.other_dog_photo_url
          : null,
      otherDogId: typeof row.other_dog_id === "string" ? row.other_dog_id : null,
      otherUserId:
        typeof row.other_user_id === "string" ? row.other_user_id : null,
      lastMessage:
        typeof row.last_message === "string" ? row.last_message : null,
      unreadCount: Number(row.unread_count ?? 0),
    }));
    res.json(ListConversationsResponse.parse(conversations));
  } catch {
    res.status(502).json({ error: "Unable to load conversations right now." });
  }
});

router.get("/conversations/:conversationId/messages", async (req, res) => {
  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid conversation." });
    return;
  }

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to view messages." });
      return;
    }
    const conversation = await findConversation(
      params.data.conversationId,
      user.headers,
    );
    if (!conversation || !isParticipant(conversation, user.id)) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }

    const otherUserId = otherParticipant(conversation, user.id);
    const pair = `(and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id}))`;
    const rows = await userRows(
      `/rest/v1/messages?select=id,sender_id,receiver_id,content,read_at,created_at&or=${encodeURIComponent(pair)}&order=created_at.asc`,
      user.headers,
    );
    res.json(ListMessagesResponse.parse(rows.map(toMessage)));
  } catch {
    res.status(502).json({ error: "Unable to load messages right now." });
  }
});

router.post("/messages", async (req, res) => {
  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please enter a valid message." });
    return;
  }

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to send a message." });
      return;
    }
    if (parsed.data.receiverId === user.id) {
      res.status(400).json({ error: "You cannot message yourself." });
      return;
    }

    const [participant1Id, participant2Id] = [
      user.id,
      parsed.data.receiverId,
    ].sort();
    const participantPair = `(and(participant_1_id.eq.${user.id},participant_2_id.eq.${parsed.data.receiverId}),and(participant_1_id.eq.${parsed.data.receiverId},participant_2_id.eq.${user.id}))`;
    const result = await withPairLock(
      `${participant1Id}:${participant2Id}`,
      async () => {
        const existing = await userRows(
          `/rest/v1/conversations?select=id,participant_1_id,participant_2_id&or=${encodeURIComponent(participantPair)}&limit=1`,
          user.headers,
        );

        let conversationId: string;
        if (existing[0]) {
          conversationId = String(existing[0].id);
        } else {
          const conversationResponse = await supabaseUserRequest(
            "/rest/v1/conversations",
            {
              method: "POST",
              headers: {
                ...user.headers,
                "Content-Type": "application/json",
                Prefer: "return=representation",
              },
              body: JSON.stringify({
                participant_1_id: participant1Id,
                participant_2_id: participant2Id,
              }),
            },
          );
          if (!conversationResponse.ok) {
            throw new Error("Supabase request failed.");
          }
          const conversations = (await conversationResponse.json()) as Row[];
          if (!conversations[0]) {
            throw new Error("Supabase request failed.");
          }
          conversationId = String(conversations[0].id);
        }

        const messageResponse = await supabaseUserRequest("/rest/v1/messages", {
          method: "POST",
          headers: {
            ...user.headers,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            sender_id: user.id,
            receiver_id: parsed.data.receiverId,
            content: parsed.data.content,
          }),
        });
        if (!messageResponse.ok) {
          throw new Error("Supabase request failed.");
        }
        const messageRows = (await messageResponse.json()) as Row[];
        const message = messageRows[0];
        if (!message) {
          throw new Error("Supabase request failed.");
        }

        const updateResponse = await supabaseUserRequest(
          `/rest/v1/conversations?id=eq.${encodeURIComponent(conversationId)}`,
          {
            method: "PATCH",
            headers: {
              ...user.headers,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ last_message_at: message.created_at }),
          },
        );
        if (!updateResponse.ok) {
          throw new Error("Supabase request failed.");
        }

        return { conversationId, message };
      },
    );

    res.status(201).json(
      SendMessageResponse.parse({
        conversationId: result.conversationId,
        message: toMessage(result.message),
      }),
    );
  } catch {
    res.status(502).json({ error: "Unable to send your message right now." });
  }
});

router.post("/conversations/:conversationId/read", async (req, res) => {
  const params = MarkConversationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid conversation." });
    return;
  }

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in to update messages." });
      return;
    }
    const conversation = await findConversation(
      params.data.conversationId,
      user.headers,
    );
    if (!conversation || !isParticipant(conversation, user.id)) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }

    const senderId = otherParticipant(conversation, user.id);
    const response = await supabaseUserRequest(
      `/rest/v1/messages?receiver_id=eq.${encodeURIComponent(user.id)}&sender_id=eq.${encodeURIComponent(senderId)}&read_at=is.null`,
      {
        method: "PATCH",
        headers: {
          ...user.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ read_at: new Date().toISOString() }),
      },
    );
    if (!response.ok) {
      throw new Error("Supabase request failed.");
    }
    res.json(MarkConversationReadResponse.parse({ success: true }));
  } catch {
    res.status(502).json({ error: "Unable to update messages right now." });
  }
});

export default router;