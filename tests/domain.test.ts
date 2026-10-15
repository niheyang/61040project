import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Bookmarking } from "../src/concepts/Bookmarking.ts";
import { Holding } from "../src/concepts/Holding.ts";
import { InvalidMessageText, MessageToSelf, Messaging } from "../src/concepts/Messaging.ts";
import { RECEIVING_WINDOW_MS, Receptivity } from "../src/concepts/Receptivity.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let database: TestDb;

beforeAll(async () => {
  database = await openTestDb();
}, 15_000);

beforeEach(async () => {
  await Promise.all([
    database.db.collection("messaging_messages").deleteMany({}),
    database.db.collection("holding_entries").deleteMany({}),
    database.db.collection("receptivity_windows").deleteMany({}),
    database.db.collection("bookmarking_saved").deleteMany({}),
  ]);
});

afterAll(async () => {
  await database?.close();
});

describe("Messaging", () => {
  test("preserves one record and selects only the requested participant's records", async () => {
    const messaging = new Messaging(database.db);
    const start = Date.now();
    const sent = await messaging.send({ sender: "alice", recipient: "bob", text: "  An interesting link  " });
    await messaging.send({ sender: "bob", recipient: "carol", text: "Another share" });

    const rows = await messaging._get(sent);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ...sent, sender: "alice", recipient: "bob", text: "An interesting link" });
    expect(Date.parse(rows[0]!.createdAt)).toBeGreaterThanOrEqual(start);
    expect(Date.parse(rows[0]!.createdAt)).toBeLessThanOrEqual(Date.now());
    expect(rows[0]).not.toHaveProperty("_id");
    expect(await messaging._sent({ user: "alice" })).toEqual(rows);
    expect(await messaging._addressedTo({ user: "bob" })).toEqual(rows);
    expect(await messaging._addressedTo({ user: "alice" })).toEqual([]);
    expect(await messaging._get({ message: "unknown" })).toEqual([]);

    // A new class instance reads the persisted content instead of memory state.
    expect(await new Messaging(database.db)._get(sent)).toEqual(rows);
  });

  test("rejects self messages, blank text, and oversized text without adding a message", async () => {
    const messaging = new Messaging(database.db);
    await expect(messaging.send({ sender: "alice", recipient: "alice", text: "Hello" })).rejects.toBeInstanceOf(MessageToSelf);
    await expect(messaging.send({ sender: "alice", recipient: "bob", text: " \n\t " })).rejects.toBeInstanceOf(InvalidMessageText);
    await expect(messaging.send({ sender: "alice", recipient: "bob", text: "x".repeat(2_001) })).rejects.toBeInstanceOf(InvalidMessageText);
    expect(await messaging._sent({ user: "alice" })).toEqual([]);
    const accepted = await messaging.send({ sender: "alice", recipient: "bob", text: "x".repeat(2_000) });
    expect((await messaging._get(accepted))[0]!.text).toHaveLength(2_000);
  });
});

describe("Holding", () => {
  test("release is idempotent, scoped to the recipient, and cannot be undone by enqueue", async () => {
    const holding = new Holding(database.db);
    const pair = { recipient: "bob", item: "message-1" };
    expect(await holding._status(pair)).toEqual({ status: "ABSENT" });
    await holding.enqueue(pair);
    await holding.enqueue(pair);
    expect(await holding._pending({ recipient: "bob" })).toEqual([{ item: pair.item }]);
    expect(await holding.release({ recipient: "alice", items: [pair.item] })).toEqual({ released: [] });
    expect(await holding.release({ recipient: "bob", items: [pair.item, pair.item, "unknown"] })).toEqual({ released: [pair.item] });
    await holding.enqueue(pair);
    expect(await holding.release({ recipient: "bob", items: [pair.item] })).toEqual({ released: [] });
    expect(await holding._status(pair)).toEqual({ status: "RELEASED" });
    expect(await holding._pending({ recipient: "bob" })).toEqual([]);
    expect(await holding._released({ recipient: "bob" })).toEqual([{ item: pair.item }]);
  });

  test("concurrent duplicate enqueues and releases produce exactly one entry and transition", async () => {
    const holding = new Holding(database.db);
    const pair = { recipient: "bob", item: "simultaneous" };
    await Promise.all(Array.from({ length: 30 }, () => holding.enqueue(pair)));
    expect(await database.db.collection("holding_entries").countDocuments(pair)).toBe(1);
    const releases = await Promise.all(Array.from({ length: 30 }, () => holding.release({ recipient: "bob", items: [pair.item] })));
    expect(releases.flatMap(result => result.released)).toEqual([pair.item]);
    expect(await holding._released({ recipient: "bob" })).toEqual([{ item: pair.item }]);
  });
});

describe("Receptivity", () => {
  test("expires at the exact deadline even before cleanup and does not expire early", async () => {
    let now = Date.parse("2026-10-13T12:00:00.000Z");
    const receptivity = new Receptivity(database.db, () => now);
    const window = await receptivity.open({ person: "bob" });
    expect(Date.parse(window.expiresAt) - Date.parse(window.startedAt)).toBe(RECEIVING_WINDOW_MS);
    now += RECEIVING_WINDOW_MS - 1;
    await receptivity.expire({ window: window.window });
    expect(await receptivity._isOpen({ person: "bob" })).toEqual({ open: true });
    expect(await receptivity._active({ person: "bob" })).toEqual([window]);
    expect(await receptivity._expired({})).toEqual([]);

    now += 1;
    expect(await receptivity._isOpen({ person: "bob" })).toEqual({ open: false });
    expect(await receptivity._active({ person: "bob" })).toEqual([]);
    expect(await receptivity._current({ person: "bob" })).toEqual([window]);
    expect(await receptivity._expired({})).toEqual([{ window: window.window }]);
    await receptivity.expire({ window: window.window });
    expect(await receptivity._current({ person: "bob" })).toEqual([]);
  });

  test("an old close or expiry cannot remove a replacement and another person cannot close it", async () => {
    let now = Date.parse("2026-10-13T12:00:00.000Z");
    const receptivity = new Receptivity(database.db, () => now);
    const old = await receptivity.open({ person: "bob" });
    now += 10 * 60 * 1_000;
    const replacement = await receptivity.open({ person: "bob" });
    expect(replacement.window).not.toBe(old.window);
    await receptivity.close({ person: "bob", window: old.window });
    await receptivity.close({ person: "alice", window: replacement.window });
    now = Date.parse(old.expiresAt);
    await receptivity.expire({ window: old.window });
    expect(await receptivity._current({ person: "bob" })).toEqual([replacement]);
    expect(await receptivity._isOpen({ person: "bob" })).toEqual({ open: true });
    await receptivity.close({ person: "bob", window: replacement.window });
    await receptivity.close({ person: "bob", window: replacement.window });
    expect(await receptivity._isOpen({ person: "bob" })).toEqual({ open: false });
    expect(await receptivity._current({ person: "bob" })).toEqual([]);
  });

  test("simultaneous openings leave at most one current window per person", async () => {
    const receptivity = new Receptivity(database.db);
    const opened = await Promise.all(Array.from({ length: 12 }, () => receptivity.open({ person: "bob" })));
    const current = await receptivity._current({ person: "bob" });
    expect(current).toHaveLength(1);
    expect(opened.map(result => result.window)).toContain(current[0]!.window);
    expect(await database.db.collection("receptivity_windows").countDocuments({ person: "bob" })).toBe(1);
  });
});

describe("Bookmarking", () => {
  test("saves are private, idempotent, persistent, and removable independently", async () => {
    const bookmarking = new Bookmarking(database.db);
    const bob = { person: "bob", item: "message-1" };
    await Promise.all(Array.from({ length: 20 }, () => bookmarking.save(bob)));
    await bookmarking.save({ person: "alice", item: bob.item });
    expect(await database.db.collection("bookmarking_saved").countDocuments(bob)).toBe(1);
    expect(await new Bookmarking(database.db)._saved({ person: "bob" })).toEqual([{ item: bob.item }]);
    expect(await bookmarking._saved({ person: "carol" })).toEqual([]);
    await bookmarking.remove(bob);
    await bookmarking.remove(bob);
    expect(await bookmarking._saved({ person: "bob" })).toEqual([]);
    expect(await bookmarking._saved({ person: "alice" })).toEqual([{ item: bob.item }]);
  });
});
