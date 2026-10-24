import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createCatchupHandler } from "../src/server.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

interface Account {
  user: string;
  username: string;
}

interface MessageRow {
  message: string;
  sender: string;
  recipient: string;
  senderUsername: string;
  recipientUsername: string;
  text: string;
  createdAt: string;
}

interface ReceivingWindow {
  window: string;
  startedAt: string;
  expiresAt: string;
}

interface Dashboard {
  incoming: MessageRow[];
  sent: (MessageRow & { status: string })[];
  saved: MessageRow[];
  windows: ReceivingWindow[];
}

type Handler = ReturnType<typeof createCatchupHandler>;
type PublicError = "INVALID_REQUEST" | "UNAUTHORIZED" | "CONFLICT" | "NOT_FOUND" | "FORBIDDEN";

const password = "test-password";
const credentials = (username: string) => ({ username, password });
const ids = (rows: MessageRow[]) => rows.map(row => row.message).sort();

let database: TestDb | undefined;
let handler: Handler | undefined;
let now: number;
let alice: Account;
let bob: Account;
let eve: Account;

async function request(path: string, input: unknown): Promise<Response> {
  if (!handler) throw new Error("Test handler has not been started");
  return handler.handle(new Request(`http://127.0.0.1:3000/api/catchup/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

async function post<T>(path: string, input: unknown): Promise<T> {
  const response = await request(path, input);
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body).not.toHaveProperty("error");
  return body as T;
}

async function denied(path: string, input: unknown, error: PublicError, status: number): Promise<void> {
  const response = await request(path, input);
  expect(response.status).toBe(status);
  // Public failures must reveal no message content or internal diagnostics.
  expect(await response.json()).toEqual({ error });
}

const dashboard = (username: string) => post<Dashboard>("dashboard", credentials(username));
const send = (recipientUsername = "bob", text = "A link to read when you have time") =>
  post<{ message: string }>("send", { ...credentials("alice"), recipientUsername, text });
const open = (username = "bob") => post<ReceivingWindow>("startCatchup", credentials(username));
const close = (window: string, username = "bob") => post<{ window: string }>("endCatchup", {
  ...credentials(username), window,
});

beforeEach(async () => {
  // Each test owns a randomly named DB. No request can touch the development DB.
  database = await openTestDb();
  now = Date.parse("2026-10-13T12:00:00.000Z");
  handler = createCatchupHandler(database.db, () => now);
  alice = await post<Account>("register", credentials("alice"));
  bob = await post<Account>("register", credentials("bob"));
  eve = await post<Account>("register", credentials("eve"));
}, 30_000);

afterEach(async () => {
  try {
    await handler?.close();
  } finally {
    handler = undefined;
    await database?.close();
    database = undefined;
  }
}, 30_000);

describe("Catchup HTTP composition", () => {
  test("accounts authenticate and failures cannot mutate someone else's inbox", async () => {
    expect(Object.keys(alice).sort()).toEqual(["user", "username"]);
    expect(alice.user).not.toBe(bob.user);
    expect(eve.user).not.toBe(bob.user);
    expect(await post<Account>("login", { username: " ALICE ", password })).toEqual(alice);
    await denied("register", credentials("ALICE"), "CONFLICT", 409);
    await denied("login", { username: "alice", password: "wrong-password" }, "UNAUTHORIZED", 401);
    await denied("dashboard", { username: "bob", password: "wrong-password" }, "UNAUTHORIZED", 401);
    await denied("send", { username: "alice", password: "wrong-password", recipientUsername: "bob", text: "Unauthorized" }, "UNAUTHORIZED", 401);
    for (const [path, extra] of [
      ["checkUsername", { recipientUsername: "alice" }],
      ["startCatchup", {}],
      ["endCatchup", { window: "guessed-window" }],
      ["save", { message: "guessed-message" }],
      ["removeSaved", { message: "guessed-message" }],
      ["viewMessage", { message: "guessed-message" }],
    ] as const) {
      await denied(path, { username: "bob", password: "wrong-password", ...extra }, "UNAUTHORIZED", 401);
    }
    expect(await dashboard("alice")).toEqual({ incoming: [], sent: [], saved: [], windows: [] });
    expect(await dashboard("bob")).toEqual({ incoming: [], sent: [], saved: [], windows: [] });
  }, 30_000);

  test("exact username checks authenticate and reveal only existence without releasing held messages", async () => {
    const held = await send("bob", "This content must stay hidden during username checks");
    const beforeAlice = await dashboard("alice");
    const beforeBob = await dashboard("bob");
    const beforeEve = await dashboard("eve");
    expect(beforeAlice.sent[0]).toMatchObject({ message: held.message, status: "PENDING" });
    expect(beforeBob).toEqual({ incoming: [], sent: [], saved: [], windows: [] });

    for (const recipientUsername of ["bob", "BOB", "  bOb  "]) {
      expect(await post("checkUsername", { ...credentials("alice"), recipientUsername })).toEqual({ exists: true });
    }
    for (const recipientUsername of ["missing_user", "bo", "bob_extra"]) {
      expect(await post("checkUsername", { ...credentials("alice"), recipientUsername })).toEqual({ exists: false });
    }
    // The recipient may check a sender's name without starting reception or
    // learning whether that person has sent them a pending share.
    expect(await post("checkUsername", { ...credentials("bob"), recipientUsername: "alice" })).toEqual({ exists: true });
    for (const recipientUsername of ["bob", "missing_user"]) {
      await denied("checkUsername", { username: "alice", password: "wrong-password", recipientUsername }, "UNAUTHORIZED", 401);
    }
    await denied("checkUsername", { username: "missing_actor", password, recipientUsername: "bob" }, "UNAUTHORIZED", 401);

    expect(await dashboard("alice")).toEqual(beforeAlice);
    expect(await dashboard("bob")).toEqual(beforeBob);
    expect(await dashboard("eve")).toEqual(beforeEve);
    await denied("viewMessage", { ...credentials("bob"), message: held.message }, "FORBIDDEN", 403);
  }, 30_000);

  test("username checks reject malformed or spoofed input without mutating state", async () => {
    await send("bob", "Held content must stay private after invalid username checks");
    const before = await dashboard("alice");
    const beforeBob = await dashboard("bob");
    const valid = { ...credentials("alice"), recipientUsername: "bob" };
    for (const input of [
      null,
      [],
      {},
      credentials("alice"),
      { ...valid, username: 42 },
      { ...valid, password: [password] },
      { ...valid, recipientUsername: 42 },
      { ...valid, recipientUsername: null },
      { ...valid, recipientUsername: "x".repeat(101) },
      { ...valid, user: eve.user },
      { ...valid, sender: eve.user },
      { ...valid, recipient: bob.user },
      { ...valid, constructor: "spoofed" },
      { ...valid, ["__proto__"]: "spoofed" },
    ]) {
      await denied("checkUsername", input, "INVALID_REQUEST", 400);
    }
    expect(await dashboard("alice")).toEqual(before);
    expect(await dashboard("bob")).toEqual(beforeBob);
  }, 30_000);

  test("the complete journey holds messages, releases them on demand, and keeps saved content after closing", async () => {
    const first = await send("bob", "First share");
    const second = await send("bob", "Second share");
    const sender = await dashboard("alice");
    expect(ids(sender.sent)).toEqual([first.message, second.message].sort());
    expect(sender.sent.every(row => row.status === "PENDING")).toBe(true);
    expect(sender.sent[0]).toMatchObject({ sender: alice.user, recipient: bob.user, senderUsername: "alice", recipientUsername: "bob" });

    // Login alone is not consent to reveal held content, counts, or IDs.
    expect(await post<Account>("login", credentials("bob"))).toEqual(bob);
    expect(await dashboard("bob")).toEqual({ incoming: [], sent: [], saved: [], windows: [] });
    await denied("viewMessage", { ...credentials("bob"), message: first.message }, "FORBIDDEN", 403);
    await denied("save", { ...credentials("bob"), message: first.message }, "FORBIDDEN", 403);

    const window = await open();
    expect(Date.parse(window.expiresAt) - Date.parse(window.startedAt)).toBe(15 * 60 * 1_000);
    expect(ids((await dashboard("bob")).incoming)).toEqual([first.message, second.message].sort());
    const duringWindow = await send("bob", "Share arriving during catch-up");
    expect(ids((await dashboard("bob")).incoming)).toEqual([first.message, second.message, duringWindow.message].sort());
    expect((await dashboard("alice")).sent.every(row => row.status === "RELEASED")).toBe(true);

    expect(await post<{ message: string }>("save", { ...credentials("bob"), message: first.message })).toEqual(first);
    await post("save", { ...credentials("bob"), message: first.message });
    expect(ids((await dashboard("bob")).saved)).toEqual([first.message]);
    expect(await close(window.window)).toEqual({ window: window.window });
    const afterClose = await send("bob", "Hidden until the next receiving window");
    const recipient = await dashboard("bob");
    expect(recipient.windows).toEqual([]);
    expect(ids(recipient.incoming)).toEqual([first.message, second.message, duringWindow.message].sort());
    expect(ids(recipient.saved)).toEqual([first.message]);
    const viewed = await post<{ record: MessageRow }>("viewMessage", { ...credentials("bob"), message: first.message });
    expect(viewed.record).toMatchObject({ message: first.message, text: "First share" });
    await denied("viewMessage", { ...credentials("bob"), message: afterClose.message }, "FORBIDDEN", 403);
    expect((await dashboard("alice")).sent.find(row => row.message === afterClose.message)?.status).toBe("PENDING");

    await post("removeSaved", { ...credentials("bob"), message: first.message });
    expect((await dashboard("bob")).saved).toEqual([]);
    expect(ids((await dashboard("bob")).incoming)).toContain(first.message);
  }, 30_000);

  test("message and window authorization are checked on the server", async () => {
    const message = await send("bob", "Bob's private message");
    const window = await open();
    expect((await dashboard("eve")).incoming).toEqual([]);
    await denied("viewMessage", { ...credentials("eve"), message: message.message }, "FORBIDDEN", 403);
    await denied("save", { ...credentials("eve"), message: message.message }, "FORBIDDEN", 403);
    await close(window.window, "eve");
    expect((await dashboard("bob")).windows.map(row => row.window)).toEqual([window.window]);
    expect((await dashboard("eve")).saved).toEqual([]);
    await post("save", { ...credentials("bob"), message: message.message });
    await post("removeSaved", { ...credentials("eve"), message: message.message });
    expect(ids((await dashboard("bob")).saved)).toEqual([message.message]);
  }, 30_000);

  test("two-way conversations keep receiving windows independent and held arrivals invisible", async () => {
    const reply = await post<{ message: string }>("send", {
      ...credentials("bob"), recipientUsername: "alice", text: "A reply that can wait for Alice",
    });
    const bobAfterSending = await dashboard("bob");
    expect(bobAfterSending.windows).toEqual([]);
    expect(bobAfterSending.incoming).toEqual([]);
    expect(bobAfterSending.sent).toHaveLength(1);
    expect(bobAfterSending.sent[0]).toMatchObject({
      message: reply.message, sender: bob.user, recipient: alice.user, status: "PENDING",
    });
    const aliceBeforeOpening = await dashboard("alice");
    expect(aliceBeforeOpening.windows).toEqual([]);
    expect(aliceBeforeOpening.incoming).toEqual([]);

    const firstFromAlice = await send("bob", "Alice's first share");
    expect(await dashboard("bob")).toEqual(bobAfterSending);
    const bobWindow = await open("bob");
    const bobWhileOpen = await dashboard("bob");
    expect(ids(bobWhileOpen.incoming)).toEqual([firstFromAlice.message]);
    expect(bobWhileOpen.sent[0]?.status).toBe("PENDING");
    expect((await dashboard("alice")).incoming).toEqual([]);
    expect((await dashboard("alice")).windows).toEqual([]);

    await post("save", { ...credentials("bob"), message: firstFromAlice.message });
    await close(bobWindow.window, "bob");
    const bobClosed = await dashboard("bob");
    expect(bobClosed.windows).toEqual([]);
    expect(ids(bobClosed.saved)).toEqual([firstFromAlice.message]);
    const laterFromAlice = await send("bob", "A held share from an existing conversation");
    const firstFromEve = await post<{ message: string }>("send", {
      ...credentials("eve"), recipientUsername: "bob", text: "A held share from a new conversation",
    });

    // Chat rows, previews, ordering, and bookmarks use this entire authorized
    // response. Neither an existing friend's share nor a new sender can alter it.
    expect(await dashboard("bob")).toEqual(bobClosed);
    await denied("viewMessage", { ...credentials("bob"), message: laterFromAlice.message }, "FORBIDDEN", 403);
    await denied("viewMessage", { ...credentials("bob"), message: firstFromEve.message }, "FORBIDDEN", 403);

    const aliceWindow = await open("alice");
    const aliceOpen = await dashboard("alice");
    expect(ids(aliceOpen.incoming)).toEqual([reply.message]);
    expect(aliceOpen.windows.map(window => window.window)).toEqual([aliceWindow.window]);
    const bobWhileAliceReceives = await dashboard("bob");
    expect(bobWhileAliceReceives.windows).toEqual([]);
    expect(ids(bobWhileAliceReceives.incoming)).toEqual([firstFromAlice.message]);
    expect(ids(bobWhileAliceReceives.saved)).toEqual([firstFromAlice.message]);
    expect(bobWhileAliceReceives.sent[0]).toMatchObject({ message: reply.message, status: "RELEASED" });

    // Bob's next explicit window releases pending shares from every friend.
    await open("bob");
    expect(ids((await dashboard("bob")).incoming)).toEqual([
      firstFromAlice.message, laterFromAlice.message, firstFromEve.message,
    ].sort());
  }, 30_000);

  test("the exact 15-minute deadline stops release before any cleanup timer runs", async () => {
    const window = await open();
    now = Date.parse(window.expiresAt) - 1;
    const lastAllowed = await send("bob", "One millisecond before expiry");
    expect(ids((await dashboard("bob")).incoming)).toEqual([lastAllowed.message]);

    now += 1;
    const held = await send("bob", "At the deadline");
    const state = await dashboard("bob");
    expect(state.windows).toEqual([]);
    expect(ids(state.incoming)).toEqual([lastAllowed.message]);
    await denied("viewMessage", { ...credentials("bob"), message: held.message }, "FORBIDDEN", 403);
    await open();
    expect(ids((await dashboard("bob")).incoming)).toEqual([held.message, lastAllowed.message].sort());
  }, 30_000);

  test("closing a stale window handle cannot end its replacement", async () => {
    const old = await open();
    now += 60_000;
    const replacement = await open();
    expect(replacement.window).not.toBe(old.window);
    await close(old.window);
    expect((await dashboard("bob")).windows.map(row => row.window)).toEqual([replacement.window]);
    const message = await send();
    expect(ids((await dashboard("bob")).incoming)).toEqual([message.message]);
    await close(replacement.window);
    expect((await dashboard("bob")).windows).toEqual([]);
  }, 30_000);

  test("concurrent sending and opening leaves no message stranded while receiving is open", async () => {
    const pending = await send("bob", "Existing held share");
    // Both request orders must work: send just before open, and send after open.
    const [first, window, second] = await Promise.all([
      send("bob", "Concurrent share one"),
      open(),
      send("bob", "Concurrent share two"),
    ]);
    const incoming = (await dashboard("bob")).incoming;
    expect(ids(incoming)).toEqual([pending.message, first.message, second.message].sort());
    expect(incoming).toHaveLength(3);
    expect((await dashboard("alice")).sent.every(row => row.status === "RELEASED")).toBe(true);
    await close(window.window);
  }, 30_000);

  test("a new application instance reads persisted identities, delivery, and bookmarks", async () => {
    const released = await send("bob", "Saved across a backend restart");
    const window = await open();
    await post("save", { ...credentials("bob"), message: released.message });
    await close(window.window);
    const held = await send("bob", "Still hidden across a backend restart");
    await handler!.close();
    handler = createCatchupHandler(database!.db, () => now);

    expect(await post<Account>("login", credentials("bob"))).toEqual(bob);
    const state = await dashboard("bob");
    expect(state.windows).toEqual([]);
    expect(ids(state.incoming)).toEqual([released.message]);
    expect(ids(state.saved)).toEqual([released.message]);
    await denied("viewMessage", { ...credentials("bob"), message: held.message }, "FORBIDDEN", 403);
    await open();
    expect(ids((await dashboard("bob")).incoming)).toEqual([released.message, held.message].sort());
  }, 30_000);

  test("malformed JSON, wrong field types, and spoofed identity fields fail without mutation", async () => {
    for (const input of [null, [], {}, { username: 42, password }, { username: "alice", password: [password] }]) {
      await denied("login", input, "INVALID_REQUEST", 400);
    }
    const before = await dashboard("alice");
    await denied("send", { ...credentials("alice"), recipientUsername: "bob", text: 12 }, "INVALID_REQUEST", 400);
    await denied("send", { ...credentials("alice"), recipientUsername: "bob", text: "Spoofed", sender: eve.user }, "INVALID_REQUEST", 400);
    await denied("send", { ...credentials("alice"), recipientUsername: "bob", text: "Spoofed", user: eve.user }, "INVALID_REQUEST", 400);
    await denied("send", { ...credentials("alice"), recipientUsername: "missing_user", text: "Unknown recipient" }, "NOT_FOUND", 404);
    await denied("send", { ...credentials("alice"), recipientUsername: "alice", text: "To self" }, "INVALID_REQUEST", 400);
    await denied("send", { ...credentials("alice"), recipientUsername: "bob", text: "   " }, "INVALID_REQUEST", 400);
    await denied("send", { ...credentials("alice"), recipientUsername: "bob", text: "x".repeat(2_001) }, "INVALID_REQUEST", 400);
    expect(await dashboard("alice")).toEqual(before);
    expect((await dashboard("bob")).incoming).toEqual([]);

    const malformed = await handler!.handle(new Request("http://127.0.0.1:3000/api/catchup/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{\"username\":",
    }));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "INVALID_REQUEST" });
  }, 30_000);
});
