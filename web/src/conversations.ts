import type { Dashboard, MessageRow, SentRow } from "./api.ts";

export type ChatMessage = MessageRow & {
  direction: "incoming" | "outgoing";
  status?: SentRow["status"];
};

export interface Conversation {
  username: string;
  user: string | null;
  messages: ChatMessage[];
  lastMessage: ChatMessage | null;
  lastAt: string | null;
}

// The server has already authorized these two collections. Never build a chat
// from raw addressed messages, pending incoming handles, or bookmark metadata.
export function buildConversations(
  dashboard: Pick<Dashboard, "incoming" | "sent">,
  draftUsernames: readonly string[] = [],
): Conversation[] {
  const conversations = new Map<string, Conversation>();
  const messages = new Map<string, Map<string, ChatMessage>>();

  function conversationFor(username: string): Conversation {
    const canonical = username.trim().toLowerCase();
    let conversation = conversations.get(canonical);
    if (!conversation) {
      conversation = { username: canonical, user: null, messages: [], lastMessage: null, lastAt: null };
      conversations.set(canonical, conversation);
      messages.set(canonical, new Map());
    }
    return conversation;
  }

  for (const username of draftUsernames) {
    const canonical = username.trim().toLowerCase();
    if (/^[a-z0-9_]{3,24}$/.test(canonical)) conversationFor(canonical);
  }

  for (const row of dashboard.incoming) {
    const conversation = conversationFor(row.senderUsername);
    conversation.user = row.sender;
    messages.get(conversation.username)!.set(row.message, { ...row, direction: "incoming" });
  }
  for (const row of dashboard.sent) {
    const conversation = conversationFor(row.recipientUsername);
    conversation.user = row.recipient;
    messages.get(conversation.username)!.set(row.message, { ...row, direction: "outgoing" });
  }

  for (const conversation of conversations.values()) {
    conversation.messages = [...messages.get(conversation.username)!.values()].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.message.localeCompare(right.message));
    conversation.lastMessage = conversation.messages.at(-1) ?? null;
    conversation.lastAt = conversation.lastMessage?.createdAt ?? null;
  }

  return [...conversations.values()].sort((left, right) => {
    if (left.lastAt === null && right.lastAt !== null) return -1;
    if (right.lastAt === null && left.lastAt !== null) return 1;
    return (right.lastAt ?? "").localeCompare(left.lastAt ?? "")
      || left.username.localeCompare(right.username);
  });
}
