import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createCatchupHandler } from "../src/server.ts";
import type { Drawing } from "../src/shared/drawing.ts";
import { sampleDrawing, invalidDrawingCases } from "./drawing-fixtures.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

interface Account { user: string; username: string }
interface MessageRow {
  message: string;
  sender: string;
  recipient: string;
  senderUsername: string;
  recipientUsername: string;
  text: string;
  drawing: Drawing | null;
  createdAt: string;
}
interface ReceivingWindow { window: string; person: string; startedAt: string; expiresAt: string }
interface Dashboard {
  incoming: MessageRow[];
  sent: (MessageRow & { status: string })[];
  saved: MessageRow[];
  windows: ReceivingWindow[];
}
type Handler = ReturnType<typeof createCatchupHandler>;
type PublicError = "INVALID_REQUEST" | "UNAUTHORIZED" | "NOT_FOUND" | "FORBIDDEN";

const password = "drawing-test-password";
const credentials = (username: string) => ({ username, password });
const ids = (rows: readonly MessageRow[]) => rows.map(row => row.message).sort();
let database: TestDb | undefined;
let handler: Handler | undefined;
let now: number;
let alice: Account;
let bob: Account;
let eve: Account;

async function rawRequest(path: string, body: string): Promise<Response> {
  if (!handler) throw new Error("Drawing test handler is not started");
  return handler.handle(new Request(`http://127.0.0.1:3000/api/catchup/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }));
}

const request = (path: string, input: unknown) => rawRequest(path, JSON.stringify(input));

async function post<T>(path: string, input: unknown): Promise<T> {
  const response = await request(path, input);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).not.toHaveProperty("error");
  return body as T;
}

async function denied(path: string, input: unknown, error: PublicError, status: number) {
  const response = await request(path, input);
  expect(response.status).toBe(status);
  // Refusals must not include the private payload or internal diagnostics.
  expect(await response.json()).toEqual({ error });
}

const dashboard = (username: string) => post<Dashboard>("dashboard", credentials(username));
const sendDrawing = (sender = "alice", recipientUsername = "bob", drawing = sampleDrawing()) =>
  post<{ message: string }>("sendDrawing", { ...credentials(sender), recipientUsername, drawing });
const open = (username = "bob") => post<ReceivingWindow>("startCatchup", credentials(username));
const close = (window: string, username = "bob") => post("endCatchup", { ...credentials(username), window });
const view = (username: string, message: string) => post<{ record: MessageRow }>("viewMessage", { ...credentials(username), message });

async function storedCounts() {
  if (!database) throw new Error("Drawing test database is not started");
  const [messages, holding, saved] = await Promise.all([
    database.db.collection("messaging_messages").countDocuments({}),
    database.db.collection("holding_entries").countDocuments({}),
    database.db.collection("bookmarking_saved").countDocuments({}),
  ]);
  return { messages, holding, saved };
}

const allDashboards = () => Promise.all([dashboard("alice"), dashboard("bob"), dashboard("eve")]);

beforeEach(async () => {
  // Every case owns its database. All setup below uses the application's actions.
  database = await openTestDb();
  now = Date.parse("2026-10-23T12:00:00.000Z");
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

describe("drawing HTTP journeys", () => {
  test("drawings stay hidden alongside released text, then follow opening, arrival, and closing", async () => {
    const older = await post<{ message: string }>("send", {
      ...credentials("alice"), recipientUsername: "bob", text: "Earlier conversation context",
    });
    const oldWindow = await open();
    await close(oldWindow.window);
    const before = await dashboard("bob");
    expect(ids(before.incoming)).toEqual([older.message]);
    expect(before.incoming[0]?.drawing).toBeNull();

    const drawing = sampleDrawing();
    const held = await sendDrawing("alice", "bob", drawing);
    expect(await post<Account>("login", credentials("bob"))).toEqual(bob);
    // The entire response stays identical: no preview, ordering, ID, or count leak.
    expect(await dashboard("bob")).toEqual(before);
    const own = (await dashboard("alice")).sent.find(row => row.message === held.message);
    expect(own).toMatchObject({ sender: alice.user, recipient: bob.user, text: "", drawing, status: "PENDING" });

    const window = await open();
    const received = await view("bob", held.message);
    expect(received.record).toMatchObject({ ...held, drawing, text: "", senderUsername: "alice", recipientUsername: "bob" });
    expect(received.record.createdAt).toBe(own!.createdAt);

    const arriving = await sendDrawing();
    expect(arriving.message).not.toBe(held.message);
    expect(ids((await dashboard("bob")).incoming)).toEqual([older.message, held.message, arriving.message].sort());
    expect((await dashboard("alice")).sent.every(row => row.status === "RELEASED")).toBe(true);
    await close(window.window);
    const afterClose = await dashboard("bob");
    const later = await sendDrawing();
    expect(await dashboard("bob")).toEqual(afterClose);
    expect((await dashboard("alice")).sent.find(row => row.message === later.message)?.status).toBe("PENDING");
    expect((await view("bob", held.message)).record.drawing).toEqual(drawing);
  }, 30_000);

  test("pending and third-party drawings cannot be fetched or saved through guessed IDs", async () => {
    const held = await sendDrawing();
    const before = await dashboard("bob");
    for (const username of ["bob", "eve"]) {
      await denied("viewMessage", { ...credentials(username), message: held.message }, "FORBIDDEN", 403);
      await denied("save", { ...credentials(username), message: held.message }, "FORBIDDEN", 403);
    }
    // Another person's receiving window cannot authorize release to Bob.
    await open("eve");
    expect(await dashboard("bob")).toEqual(before);
    await open("bob");
    expect((await view("bob", held.message)).record.drawing).toEqual(sampleDrawing());
    await denied("viewMessage", { ...credentials("eve"), message: held.message }, "FORBIDDEN", 403);
    await denied("save", { ...credentials("eve"), message: held.message }, "FORBIDDEN", 403);
    expect((await dashboard("eve")).incoming).toEqual([]);
    expect((await dashboard("eve")).saved).toEqual([]);
    expect(await storedCounts()).toEqual({ messages: 1, holding: 1, saved: 0 });
  }, 30_000);

  test("malformed drawings are refused without changing messages, holding, or any actor's dashboard", async () => {
    await sendDrawing();
    const before = await allDashboards();
    const counts = await storedCounts();
    for (const { value } of invalidDrawingCases()) {
      await denied("sendDrawing", { ...credentials("alice"), recipientUsername: "bob", drawing: value }, "INVALID_REQUEST", 400);
      expect(await storedCounts()).toEqual(counts);
    }
    expect(await allDashboards()).toEqual(before);
  }, 30_000);

  test("wrong credentials, missing recipients, self sends, and spoofed fields cannot create drawings", async () => {
    await sendDrawing();
    const before = await allDashboards();
    const counts = await storedCounts();
    const valid = { ...credentials("alice"), recipientUsername: "bob", drawing: sampleDrawing() };
    for (const recipientUsername of ["bob", "missing_user"]) {
      await denied("sendDrawing", { ...valid, password: "wrong-password", recipientUsername }, "UNAUTHORIZED", 401);
    }
    await denied("sendDrawing", { ...valid, username: "missing_actor" }, "UNAUTHORIZED", 401);
    await denied("sendDrawing", { ...valid, recipientUsername: "missing_user" }, "NOT_FOUND", 404);
    await denied("sendDrawing", { ...valid, recipientUsername: "alice" }, "INVALID_REQUEST", 400);
    for (const input of [
      null, [], {}, credentials("alice"),
      { ...valid, username: 42 }, { ...valid, password: [password] },
      { ...valid, recipientUsername: 42 }, { ...valid, recipientUsername: "x".repeat(101) },
      { ...valid, sender: eve.user }, { ...valid, user: eve.user },
      { ...valid, recipient: bob.user }, { ...valid, person: eve.user },
      { ...valid, text: "A second content type" }, { ...valid, constructor: "spoofed" },
      { ...valid, ["__proto__"]: { sender: eve.user } },
    ]) {
      await denied("sendDrawing", input, "INVALID_REQUEST", 400);
      expect(await storedCounts()).toEqual(counts);
    }
    expect(await allDashboards()).toEqual(before);
  }, 30_000);

  test("a drawing at the request-body limit succeeds and one extra byte fails without mutation", async () => {
    const json = JSON.stringify({ ...credentials("alice"), recipientUsername: "bob", drawing: sampleDrawing() });
    const size = new TextEncoder().encode(json).byteLength;
    // JSON permits trailing whitespace. Thus both bodies contain a valid drawing,
    // and only the HTTP byte limit can distinguish acceptance from rejection.
    const atLimit = json + " ".repeat(128_000 - size);
    expect(new TextEncoder().encode(atLimit).byteLength).toBe(128_000);
    const accepted = await rawRequest("sendDrawing", atLimit);
    expect(accepted.status).toBe(200);
    const sent = await accepted.json() as { message: string };
    expect(typeof sent.message).toBe("string");
    expect((await dashboard("alice")).sent[0]?.drawing).toEqual(sampleDrawing());
    const before = await allDashboards();
    const counts = await storedCounts();
    const rejected = await rawRequest("sendDrawing", atLimit + " ");
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ error: "INVALID_REQUEST" });
    expect(await storedCounts()).toEqual(counts);
    expect(await allDashboards()).toEqual(before);
  }, 30_000);

  test("drawing bookmarks are private, idempotent, and removable without erasing conversation history", async () => {
    const sent = await sendDrawing();
    const window = await open();
    const before = (await view("bob", sent.message)).record;
    await post("save", { ...credentials("bob"), ...sent });
    await post("save", { ...credentials("bob"), ...sent });
    expect((await dashboard("bob")).saved).toEqual([before]);
    expect((await dashboard("alice")).saved).toEqual([]);
    await post("removeSaved", { ...credentials("eve"), ...sent });
    expect((await dashboard("bob")).saved).toEqual([before]);
    await close(window.window);
    await post("removeSaved", { ...credentials("bob"), ...sent });
    await post("removeSaved", { ...credentials("bob"), ...sent });
    const state = await dashboard("bob");
    expect(state.saved).toEqual([]);
    expect(state.incoming).toEqual([before]);
    expect((await view("bob", sent.message)).record).toEqual(before);
    expect(await storedCounts()).toEqual({ messages: 1, holding: 1, saved: 0 });
  }, 30_000);

  test("an application restart preserves drawings, timestamps, bookmarks, and pending privacy", async () => {
    const released = await sendDrawing();
    const window = await open();
    await post("save", { ...credentials("bob"), ...released });
    await close(window.window);
    const held = await sendDrawing();
    const beforeBob = await dashboard("bob");
    const beforeAlice = await dashboard("alice");
    await handler!.close();
    handler = createCatchupHandler(database!.db, () => now);

    expect(await post<Account>("login", credentials("bob"))).toEqual(bob);
    expect(await dashboard("bob")).toEqual(beforeBob);
    expect(await dashboard("alice")).toEqual(beforeAlice);
    expect(ids(beforeBob.incoming)).toEqual([released.message]);
    expect(beforeBob.saved[0]?.drawing).toEqual(sampleDrawing());
    await denied("viewMessage", { ...credentials("bob"), ...held }, "FORBIDDEN", 403);
    await denied("viewMessage", { ...credentials("eve"), ...released }, "FORBIDDEN", 403);
    await open();
    const newIncoming = (await dashboard("bob")).incoming;
    expect(ids(newIncoming)).toEqual([released.message, held.message].sort());
    expect(newIncoming.find(row => row.message === held.message)?.createdAt)
      .toBe(beforeAlice.sent.find(row => row.message === held.message)?.createdAt);
  }, 30_000);

  test("drawings stop releasing at the exact deadline before expiry cleanup", async () => {
    const window = await open();
    now = Date.parse(window.expiresAt) - 1;
    const accepted = await sendDrawing();
    expect(ids((await dashboard("bob")).incoming)).toEqual([accepted.message]);
    now += 1;
    const held = await sendDrawing();
    const state = await dashboard("bob");
    expect(state.windows).toEqual([]);
    expect(ids(state.incoming)).toEqual([accepted.message]);
    await denied("viewMessage", { ...credentials("bob"), ...held }, "FORBIDDEN", 403);
    expect((await dashboard("alice")).sent.find(row => row.message === held.message)?.status).toBe("PENDING");
    await handler!.expireWindows();
    expect(await dashboard("bob")).toEqual(state);
    await open();
    expect(ids((await dashboard("bob")).incoming)).toEqual([accepted.message, held.message].sort());
  }, 30_000);

  test("concurrent drawing and opening releases each message exactly once", async () => {
    const pending = await sendDrawing();
    const [first, window, second] = await Promise.all([sendDrawing(), open(), sendDrawing()]);
    const expected = [pending.message, first.message, second.message].sort();
    const state = await dashboard("bob");
    expect(ids(state.incoming)).toEqual(expected);
    expect(state.incoming).toHaveLength(3);
    for (const row of state.incoming) expect(row.drawing).toEqual(sampleDrawing());
    expect((await dashboard("alice")).sent.every(row => row.status === "RELEASED")).toBe(true);
    expect(await storedCounts()).toEqual({ messages: 3, holding: 3, saved: 0 });
    await close(window.window);
  }, 30_000);

  test("both drawing/close request orders obey the receiving boundary", async () => {
    const firstWindow = await open();
    const [beforeClose] = await Promise.all([sendDrawing(), close(firstWindow.window)]);
    expect(ids((await dashboard("bob")).incoming)).toEqual([beforeClose.message]);
    expect((await dashboard("alice")).sent.find(row => row.message === beforeClose.message)?.status).toBe("RELEASED");

    const secondWindow = await open();
    const [, afterClose] = await Promise.all([close(secondWindow.window), sendDrawing()]);
    const state = await dashboard("bob");
    expect(state.windows).toEqual([]);
    expect(ids(state.incoming)).toEqual([beforeClose.message]);
    expect((await dashboard("alice")).sent.find(row => row.message === afterClose.message)?.status).toBe("PENDING");
    await denied("viewMessage", { ...credentials("bob"), ...afterClose }, "FORBIDDEN", 403);
    await open();
    expect(ids((await dashboard("bob")).incoming)).toEqual([beforeClose.message, afterClose.message].sort());
  }, 30_000);
});
