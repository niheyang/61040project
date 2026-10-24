import { describe, expect, test } from "bun:test";
import { buildConversations, type ChatMessage, type Conversation } from "../web/src/conversations.ts";
import { getNewChatUsername, getSearchTarget, highlightMatches, searchConversations } from "../web/src/search.ts";

function message(id: string, text: string, minute: number): ChatMessage {
  return {
    message: id, text, drawing: null, sender: "bob-id", recipient: "alice-id",
    senderUsername: "bob", recipientUsername: "alice", direction: "incoming",
    createdAt: new Date(Date.UTC(2026, 9, 23, 12, minute)).toISOString(),
  };
}

function conversation(username: string, messages: ChatMessage[] = []): Conversation {
  const lastMessage = messages.at(-1) ?? null;
  return { username, user: `${username}-id`, messages, lastMessage, lastAt: lastMessage?.createdAt ?? null };
}

describe("conversation search", () => {
  test("matches one letter immediately, ignores case, and preserves conversation order", () => {
    const chats = [conversation("carol"), conversation("alice_demo"), conversation("bob")];
    expect(searchConversations(chats, "C").map(chat => chat.username)).toEqual(["carol", "alice_demo"]);
    expect(searchConversations(chats, "z")).toEqual([]);
  });

  test("accepts a leading @ for names without removing @ from content searches", () => {
    const chats = [
      conversation("alice_demo"),
      conversation("bob", [message("plain", "alice_demo said hello", 1)]),
      conversation("carol", [message("mention", "Ask @alice_demo", 1)]),
    ];
    expect(searchConversations(chats, "  @ALICE_DEMO  ").map(chat => chat.username)).toEqual(["alice_demo", "carol"]);
  });

  test("finds older content and previews the newest matching message even if the name also matches", () => {
    const older = message("one", "Plans for the lake", 1);
    const matching = message("two", "The LAKE looks lovely", 2);
    const latest = message("three", "See you tomorrow", 3);
    const chats = [conversation("lake_friend", [older, matching, latest]), conversation("bob", [older])];
    const results = searchConversations(chats, "lake");
    expect(results.map(result => result.matchCount)).toEqual([2, 1]);
    expect(results[0]?.previewMessage).toBe(matching);
    expect(results[0]?.previewText).toBe("The LAKE looks lovely");
    expect(results[1]?.previewMessage).toBe(older);
    expect(searchConversations(chats, "friend")[0]?.previewMessage).toBe(latest);
  });

  test("empty queries include empty chats and use a compact latest-message preview", () => {
    const latest = message("latest", "  hello\n\t there   friend  ", 1);
    const chats = [conversation("alice", [latest]), conversation("bob")];
    const results = searchConversations(chats, " \n ");
    expect(results.map(result => result.previewText)).toEqual(["hello there friend", ""]);
    expect(results.map(result => result.matchCount)).toEqual([0, 0]);
    expect(results[0]?.previewMessage).toBe(latest);
    expect(results[1]?.previewMessage).toBeNull();
  });

  test("centers a compact preview around a distant match and retains long queries in full", () => {
    const text = `${"before ".repeat(30)}needle\n ${"after ".repeat(30)}`;
    const [result] = searchConversations([conversation("bob", [message("long", text, 1)])], "needle");
    expect(result?.previewText).toContain("needle");
    expect(result?.previewText).toStartWith("…");
    expect(result?.previewText).toEndWith("…");
    expect(result?.previewText.length).toBeLessThanOrEqual(92);
    expect(result?.previewText).not.toContain("\n");

    const longQuery = "q".repeat(120);
    const [long] = searchConversations([conversation("bob", [message("long", `before ${longQuery} after`, 1)])], longQuery);
    expect(long?.previewText).toContain(longQuery);
  });

  test("queries are literal and inputs remain unchanged", () => {
    const chats = [conversation("bob", [message("literal", "A [x].* and <b>hello</b>", 1)])];
    const before = structuredClone(chats);
    expect(searchConversations(chats, "[x].*")[0]?.matchCount).toBe(1);
    expect(searchConversations(chats, "[y]")).toEqual([]);
    expect(searchConversations(chats, "<b>")[0]?.previewText).toContain("<b>");
    expect(chats).toEqual(before);
  });

  test("searches only authorized supplied conversations, never saved-only records", () => {
    const hidden = message("saved-only", "hidden secret", 1);
    const shown = message("visible", "hello", 2);
    const conversations = buildConversations({ incoming: [shown], sent: [], saved: [hidden] } as Parameters<typeof buildConversations>[0]);
    expect(searchConversations(conversations, "secret")).toEqual([]);
    expect(searchConversations(conversations, "hello")[0]?.previewMessage?.message).toBe("visible");
  });
});

describe("literal match highlighting", () => {
  test("splits every nonoverlapping case-insensitive match and preserves original text", () => {
    expect(highlightMatches("Alice and ALICE", "alice")).toEqual([
      { text: "Alice", match: true }, { text: " and ", match: false }, { text: "ALICE", match: true },
    ]);
    expect(highlightMatches("banana", "ana")).toEqual([
      { text: "b", match: false }, { text: "ana", match: true }, { text: "na", match: false },
    ]);
  });

  test("retains whitespace, literal metacharacters, and HTML as plain text segments", () => {
    const original = "  <b>[.*]</b>\n [.*]  ";
    const parts = highlightMatches(original, "[.*]");
    expect(parts.filter(part => part.match).map(part => part.text)).toEqual(["[.*]", "[.*]"]);
    expect(parts.map(part => part.text).join("")).toBe(original);
    expect(highlightMatches("<script>alert(1)</script>", "<script>")[0]).toEqual({ text: "<script>", match: true });
  });

  test("uses offsets from the original text even when Unicode lowercasing would change length", () => {
    expect(highlightMatches("İ AB", "ab")).toEqual([
      { text: "İ ", match: false }, { text: "AB", match: true },
    ]);
  });

  test("returns unchanged text for empty, whitespace-only, or unmatched queries", () => {
    expect(highlightMatches("Hello", " ")).toEqual([{ text: "Hello", match: false }]);
    expect(highlightMatches("Hello", "z")).toEqual([{ text: "Hello", match: false }]);
    expect(highlightMatches("", "x")).toEqual([{ text: "", match: false }]);
  });
});

describe("finding a conversation or starting a new chat", () => {
  test("keeps a new username available when another conversation contains that name", () => {
    const chats = [conversation("alice", [message("mention", "Charlie recommended this", 1)])];
    const results = searchConversations(chats, "charlie");
    expect(results[0]?.username).toBe("alice");
    expect(getSearchTarget(results, "charlie")).toBeUndefined();
    expect(getNewChatUsername(chats, "charlie", "bob")).toBe("charlie");
    expect(getNewChatUsername(chats, "  @CHARLIE  ", "bob")).toBe("charlie");
  });

  test("Enter looks up an exact username with or without @ despite content matches", () => {
    const chats = [conversation("alice", [message("mention", "Ask @charlie", 1)])];
    const results = searchConversations(chats, "@charlie");
    expect(results[0]?.username).toBe("alice");
    expect(getSearchTarget(results, "  @CHARLIE  ")).toBeUndefined();
    expect(getSearchTarget(results, "charlie")).toBeUndefined();
    expect(getSearchTarget(results, "ali")).toBeUndefined();
    expect(getSearchTarget([], "@charlie")).toBeUndefined();
    expect(getSearchTarget([], "charlie")).toBeUndefined();
  });

  test("an exact existing username wins over earlier matching message content", () => {
    const chats = [
      conversation("alice", [message("mention", "Ask @charlie", 1)]),
      conversation("charlie"),
    ];
    const results = searchConversations(chats, "charlie");
    expect(getSearchTarget(results, "CHARLIE")?.username).toBe("charlie");
    expect(getSearchTarget(results, " @Charlie ")?.username).toBe("charlie");
    expect(getNewChatUsername(chats, "charlie", "bob")).toBeNull();
    expect(getNewChatUsername(chats, "@CHARLIE", "bob")).toBeNull();
  });

  test("offers only valid, non-self, not-yet-existing usernames", () => {
    const chats = [conversation("alice")];
    for (const invalid of ["", "  ", "@", "ab", "a".repeat(25), "charlie!", "first last", "中文名", "@@charlie", "bob", " @BOB "]) {
      expect(getNewChatUsername(chats, invalid, "bob")).toBeNull();
    }
    expect(getNewChatUsername(chats, " @SAM_123 ", "bob")).toBe("sam_123");
    expect(getNewChatUsername(chats, "x".repeat(24), "bob")).toBe("x".repeat(24));
  });
});
