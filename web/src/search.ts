import type { ChatMessage, Conversation } from "./conversations.ts";

export interface ConversationSearchResult extends Conversation {
  previewMessage: ChatMessage | null;
  previewText: string;
  matchCount: number;
}

export interface HighlightPart {
  text: string;
  match: boolean;
}

// Escape the query rather than interpreting user input as a regular expression.
// RegExp's case-insensitive matching retains offsets into the original string.
function literalPattern(query: string, global = false): RegExp {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), global ? "gi" : "i");
}

export function highlightMatches(text: string, rawQuery: string): HighlightPart[] {
  const query = rawQuery.trim();
  if (!query) return [{ text, match: false }];

  const parts: HighlightPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(literalPattern(query, true))) {
    const index = match.index!;
    if (index > cursor) parts.push({ text: text.slice(cursor, index), match: false });
    parts.push({ text: match[0], match: true });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts.length ? parts : [{ text, match: false }];
}

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function excerpt(text: string, query: string): string {
  const flattened = compact(text);
  const match = query ? literalPattern(query).exec(text) : null;
  const matchStart = match ? text.slice(0, match.index).replace(/\s+/g, " ").trimStart().length : 0;
  const matchLength = match ? compact(match[0]).length : 0;
  const limit = Math.max(90, matchLength);
  if (flattened.length <= limit) return flattened;

  // Include the whole match, even when a query is longer than a normal preview.
  let start = Math.max(0, matchStart - Math.floor((limit - matchLength) / 2));
  start = Math.min(start, flattened.length - limit);
  const end = start + limit;
  return `${start ? "…" : ""}${flattened.slice(start, end)}${end < flattened.length ? "…" : ""}`;
}

function newest(messages: readonly ChatMessage[]): ChatMessage | null {
  return messages.reduce<ChatMessage | null>((latest, message) => {
    if (!latest) return message;
    return message.createdAt.localeCompare(latest.createdAt) > 0
      || (message.createdAt === latest.createdAt && message.message.localeCompare(latest.message) > 0)
      ? message : latest;
  }, null);
}

// Only search the authorized messages provided by buildConversations. Neither
// bookmark metadata nor pending incoming messages are additional search sources.
export function searchConversations(
  conversations: readonly Conversation[],
  rawQuery: string,
): ConversationSearchResult[] {
  const query = rawQuery.trim();
  const usernameQuery = query.startsWith("@") ? query.slice(1) : query;
  const pattern = query ? literalPattern(query) : null;
  return conversations.flatMap(conversation => {
    const matchingMessages = pattern
      ? conversation.messages.filter(message => !message.drawing && pattern.test(message.text))
      : [];
    const matchesUsername = usernameQuery.length > 0
      && literalPattern(usernameQuery).test(conversation.username);
    if (query && !matchesUsername && !matchingMessages.length) return [];

    const previewMessage = newest(matchingMessages) ?? conversation.lastMessage;
    return [{
      ...conversation,
      previewMessage,
      previewText: previewMessage?.drawing ? "[Drawing]" : previewMessage ? excerpt(previewMessage.text, query) : "",
      matchCount: matchingMessages.length,
    }];
  });
}

// Enter addresses a username, while clicking a result opens a content match.
export function getSearchTarget(
  results: readonly ConversationSearchResult[],
  rawQuery: string,
): ConversationSearchResult | undefined {
  const username = rawQuery.trim().toLowerCase().replace(/^@/, "");
  return results.find(result => result.username === username);
}
