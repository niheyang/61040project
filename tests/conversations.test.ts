import { describe, expect, test } from "bun:test";
import { buildConversations } from "../web/src/conversations.ts";
import type { Dashboard, MessageRow } from "../web/src/api.ts";

function message(message: string, sender: string, recipient: string, minute: number): MessageRow {
  return {
    message, sender: `${sender}-id`, recipient: `${recipient}-id`,
    senderUsername: sender, recipientUsername: recipient,
    text: `Content of ${message}`, drawing: null, createdAt: new Date(Date.UTC(2026, 9, 20, 12, minute)).toISOString(),
  };
}

function emptyDashboard(): Dashboard {
  return { incoming: [], sent: [], saved: [], windows: [] };
}

describe("friend conversation model", () => {
  test("combines both directions into one chronological thread with original identities and delivery states", () => {
    const dashboard = emptyDashboard();
    dashboard.incoming = [message("reply", "bob", "alice", 2)];
    dashboard.sent = [
      { ...message("follow-up", "alice", "bob", 3), status: "PENDING" },
      { ...message("first", "alice", "bob", 1), status: "RELEASED" },
    ];
    const [conversation] = buildConversations(dashboard);
    expect(conversation?.username).toBe("bob");
    expect(conversation?.user).toBe("bob-id");
    expect(conversation?.messages.map(row => [row.message, row.direction, row.status])).toEqual([
      ["first", "outgoing", "RELEASED"], ["reply", "incoming", undefined], ["follow-up", "outgoing", "PENDING"],
    ]);
    expect(conversation?.lastMessage?.text).toBe("Content of follow-up");
    expect(conversation?.lastAt).toBe(dashboard.sent[0]?.createdAt ?? null);
  });

  test("keeps friends separate and orders conversation previews by the latest authorized message", () => {
    const dashboard = emptyDashboard();
    dashboard.incoming = [message("bob-old", "bob", "alice", 1), message("carol-new", "carol", "alice", 5)];
    dashboard.sent = [{ ...message("bob-new", "alice", "bob", 7), status: "PENDING" }];
    const conversations = buildConversations(dashboard);
    expect(conversations.map(row => row.username)).toEqual(["bob", "carol"]);
    expect(conversations.map(row => row.messages.map(message => message.message))).toEqual([
      ["bob-old", "bob-new"], ["carol-new"],
    ]);
  });

  test("starts only explicitly chosen empty chats and merges canonical usernames with persisted history", () => {
    const dashboard = emptyDashboard();
    dashboard.incoming = [message("known", "bob", "alice", 1)];
    const conversations = buildConversations(dashboard, [" BOB ", "carol", "CAROL", "invalid name"]);
    expect(conversations.map(row => row.username)).toEqual(["carol", "bob"]);
    expect(conversations[0]).toMatchObject({ user: null, messages: [], lastMessage: null, lastAt: null });
    expect(conversations[1]?.messages.map(row => row.message)).toEqual(["known"]);
    expect(buildConversations(emptyDashboard())).toEqual([]);
  });

  test("never creates a conversation or preview from saved-only metadata", () => {
    const dashboard = emptyDashboard();
    dashboard.saved = [message("orphan-bookmark", "eve", "alice", 9)];
    expect(buildConversations(dashboard)).toEqual([]);
    dashboard.sent = [{ ...message("own-share", "alice", "bob", 1), status: "PENDING" }];
    expect(buildConversations(dashboard).map(row => row.username)).toEqual(["bob"]);
  });

  test("deduplicates messages, breaks equal-time ties consistently, and leaves source arrays unchanged", () => {
    const dashboard = emptyDashboard();
    const first = message("a", "bob", "alice", 1);
    const second = message("b", "bob", "alice", 1);
    dashboard.incoming = [second, first, first];
    const before = structuredClone(dashboard);
    expect(buildConversations(dashboard)[0]?.messages.map(row => row.message)).toEqual(["a", "b"]);
    expect(dashboard).toEqual(before);
  });
});
