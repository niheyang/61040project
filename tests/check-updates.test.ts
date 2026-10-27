import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Receiving } from "../src/concepts/Receiving.ts";
import { createCatchupHandler } from "../src/server.ts";
import type { Dashboard } from "../web/src/api.ts";
import { sampleDrawing } from "./drawing-fixtures.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

interface Account { user: string; username: string }
interface ReceivingWindow { window: string; startedAt: string; expiresAt: string }
type Handler = ReturnType<typeof createCatchupHandler>;
const credentials = (username: string) => ({ username, password: "updates-test-password" });
let database: TestDb | undefined;
let handler: Handler | undefined;
let now: number;
let bob: Account;

async function request(input: unknown) {
  if (!handler) throw new Error("Check-updates test handler is not started");
  return handler.handle(new Request("https://catchup.test/api/catchup/checkUpdates", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }));
}

async function post<T>(path: string, input: unknown): Promise<T> {
  if (!handler) throw new Error("Check-updates test handler is not started");
  const response = await handler.handle(new Request(`https://catchup.test/api/catchup/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }));
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body).not.toHaveProperty("error");
  return body as T;
}

async function check(username: string, waiting: boolean) {
  const response = await request(credentials(username));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  // Exact equality rules out counts, sender names, handles, and content previews.
  expect(await response.json()).toEqual({ waiting });
}

const dashboard = (username: string) => post<Dashboard>("dashboard", credentials(username));
const allDashboards = () => Promise.all([dashboard("alice"), dashboard("bob"), dashboard("eve")]);

async function storedState() {
  if (!database) throw new Error("Check-updates test DB is not started");
  return Promise.all([
    "auth.users", "messaging_messages", "receiving_recipients", "bookmarking_saved",
  ].map(name => database!.db.collection(name).find({}).sort({ _id: 1 }).toArray()));
}

beforeEach(async () => {
  database = await openTestDb();
  now = Date.parse("2026-10-26T12:00:00.000Z");
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

test("Receiving reports only whether this recipient has pending items, without changing them", async () => {
  const receiving = new Receiving(database!.db, () => now);
  expect(await receiving._hasPending({ recipient: "bob" })).toEqual({ waiting: false });
  await receiving.enqueue({ recipient: "eve", item: "other-recipient" });
  expect(await receiving._hasPending({ recipient: "bob" })).toEqual({ waiting: false });
  await receiving.enqueue({ recipient: "bob", item: "one" });
  expect(await receiving._hasPending({ recipient: "bob" })).toEqual({ waiting: true });
  await receiving.enqueue({ recipient: "bob", item: "two" });
  const before = await storedState();
  expect(await receiving._hasPending({ recipient: "bob" })).toEqual({ waiting: true });
  expect(await new Receiving(database!.db, () => now)._hasPending({ recipient: "bob" })).toEqual({ waiting: true });
  expect(await storedState()).toEqual(before);
  await receiving.open({ person: "bob" });
  expect(await receiving._hasPending({ recipient: "bob" })).toEqual({ waiting: false });
  expect(await receiving._hasPending({ recipient: "eve" })).toEqual({ waiting: true });
});

describe("opt-in update checks", () => {
  beforeEach(async () => {
    handler = createCatchupHandler(database!.db, () => now);
    await post<Account>("register", credentials("alice"));
    bob = await post<Account>("register", credentials("bob"));
    await post<Account>("register", credentials("eve"));
  }, 30_000);

  test("text and drawings change only the boolean; checking never opens reception or releases content", async () => {
    await check("bob", false);
    const text = await post<{ message: string }>("send", {
      ...credentials("alice"), recipientUsername: "bob", text: "Keep this text hidden",
    });
    await check("bob", true);
    const drawing = await post<{ message: string }>("sendDrawing", {
      ...credentials("eve"), recipientUsername: "bob", drawing: sampleDrawing(),
    });
    const before = await storedState();
    const dashboards = await allDashboards();
    expect(dashboards[1]).toEqual({ incoming: [], sent: [], saved: [], windows: [] });
    // More shares and another sender must not make the response more informative.
    await check("bob", true);
    await check("  BOB  ", true);
    await check("alice", false);
    await check("eve", false);
    expect(await storedState()).toEqual(before);
    expect(await allDashboards()).toEqual(dashboards);
    for (const { message } of [text, drawing]) {
      const response = await handler!.handle(new Request("https://catchup.test/api/catchup/viewMessage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...credentials("bob"), message }),
      }));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "FORBIDDEN" });
    }

    const window = await post<ReceivingWindow>("startCatchup", credentials("bob"));
    await post("save", { ...credentials("bob"), message: drawing.message });
    const openState = await storedState();
    await check("bob", false);
    expect(await storedState()).toEqual(openState);
    const received = await dashboard("bob");
    expect(received.incoming).toHaveLength(2);
    expect(received.saved).toHaveLength(1);
    await post("endCatchup", { ...credentials("bob"), window: window.window });
    await post("send", { ...credentials("alice"), recipientUsername: "bob", text: "A later share" });
    await check("bob", true);
    expect((await dashboard("bob")).incoming).toEqual(received.incoming);
  }, 60_000);

  test("credentials identify the only recipient that may be checked; malformed or forged input cannot change state", async () => {
    await post("send", { ...credentials("alice"), recipientUsername: "bob", text: "Private pending share" });
    const before = await storedState();
    const dashboards = await allDashboards();
    const cases: [unknown, number, string][] = [
      [{ username: "bob" }, 400, "INVALID_REQUEST"],
      [{ ...credentials("bob"), password: "wrong-password" }, 401, "UNAUTHORIZED"],
      [credentials("missing_user"), 401, "UNAUTHORIZED"],
      [{ ...credentials("eve"), person: bob.user }, 400, "INVALID_REQUEST"],
      [{ ...credentials("eve"), recipient: bob.user }, 400, "INVALID_REQUEST"],
      [{ ...credentials("eve"), recipientUsername: "bob" }, 400, "INVALID_REQUEST"],
      [{ username: { $ne: null }, password: "updates-test-password" }, 400, "INVALID_REQUEST"],
    ];
    for (const [input, status, error] of cases) {
      const response = await request(input);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error });
    }
    await check("eve", false);
    await check("bob", true);
    expect(await storedState()).toEqual(before);
    expect(await allDashboards()).toEqual(dashboards);
  }, 30_000);

  test("checking at window expiry neither renews the window nor releases a newly held share", async () => {
    await post("send", { ...credentials("alice"), recipientUsername: "bob", text: "Already released history" });
    const window = await post<ReceivingWindow>("startCatchup", credentials("bob"));
    now = Date.parse(window.expiresAt);
    await post("sendDrawing", { ...credentials("eve"), recipientUsername: "bob", drawing: sampleDrawing() });
    const before = await storedState();
    const dashboards = await allDashboards();
    expect(dashboards[1]?.windows).toEqual([]);
    expect(dashboards[1]?.incoming).toHaveLength(1);
    await check("bob", true);
    await check("bob", true);
    expect(await storedState()).toEqual(before);
    expect(await allDashboards()).toEqual(dashboards);
  }, 30_000);
});
