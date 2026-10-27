import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Document } from "mongodb";
import { Receiving, type ReceivingDocument } from "../src/concepts/Receiving.ts";
import { migrateReceiving } from "../src/migrations/receiving.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let database: TestDb | undefined;
const instant = Date.parse("2026-10-26T12:05:00.000Z");
const activeWindow = {
  window: "legacy-bob-window", person: "bob",
  startedAt: "2026-10-26T12:00:00.000Z", expiresAt: "2026-10-26T12:15:00.000Z",
};
const expiredWindow = {
  window: "legacy-dave-window", person: "dave",
  startedAt: "2026-10-26T11:45:00.000Z", expiresAt: "2026-10-26T12:00:00.000Z",
};
const preservedCollections = [
  "auth.users", "messaging_messages", "bookmarking_saved", "holding_entries", "receptivity_windows",
];

beforeEach(async () => { database = await openTestDb(); }, 15_000);
afterEach(async () => { await database?.close(); database = undefined; });

async function snapshot(names = [...preservedCollections, "receiving_recipients", "schema_migrations"]) {
  const entries = await Promise.all(names.map(async name => [
    name, await database!.db.collection(name).find({}).sort({ _id: 1 }).toArray(),
  ] as const));
  return Object.fromEntries(entries);
}

async function seedLegacy() {
  // Migration tests intentionally insert the retired schema. The other rows are
  // preservation sentinels, not setup for tests of current concept behavior.
  await database!.db.collection("auth.users").insertOne({
    username: "bob", passwordHash: "legacy-test-hash-must-remain-unchanged",
  });
  await database!.db.collection("messaging_messages").insertOne({
    message: "message-pending", sender: "alice", recipient: "bob",
    text: "Preserve this message", drawing: null, createdAt: "2026-10-26T11:59:00.000Z",
  });
  await database!.db.collection("bookmarking_saved").insertOne({ person: "bob", item: "message-released" });
  await database!.db.collection("holding_entries").insertMany([
    { recipient: "bob", item: "message-pending", status: "PENDING" },
    { recipient: "bob", item: "message-released", status: "PENDING" },
    { recipient: "bob", item: "message-released", status: "RELEASED" },
    { recipient: "bob", item: "message-released", status: "PENDING" },
    { recipient: "carol", item: "only-entry", status: "PENDING" },
  ]);
  await database!.db.collection("receptivity_windows").insertMany([
    { ...activeWindow },
    { ...expiredWindow, startedAt: new Date(expiredWindow.startedAt), expiresAt: new Date(expiredWindow.expiresAt) },
  ]);
}

describe("Receiving storage migration", () => {
  test("preserves availability, window handles and dates, and unrelated data without opening or releasing anything", async () => {
    await seedLegacy();
    const before = await snapshot(preservedCollections);
    expect(await migrateReceiving(database!.db)).toEqual({
      alreadyApplied: false, recipients: 3, entries: 3, windows: 2,
    });
    expect(await snapshot(preservedCollections)).toEqual(before);

    const receiving = new Receiving(database!.db, () => instant);
    expect(await receiving._current({ person: "bob" })).toEqual([activeWindow]);
    expect(await receiving._active({ person: "bob" })).toEqual([activeWindow]);
    expect(await receiving._pending({ recipient: "bob" })).toEqual([{ item: "message-pending" }]);
    // A later pending duplicate must not downgrade a formerly released item.
    expect(await receiving._released({ recipient: "bob" })).toEqual([{ item: "message-released" }]);
    expect(await receiving._status({ recipient: "bob", item: "message-released" })).toEqual({ status: "RELEASED" });
    expect(await receiving._hasPending({ recipient: "bob" })).toEqual({ waiting: true });
    expect(await receiving._current({ person: "carol" })).toEqual([]);
    expect(await receiving._pending({ recipient: "carol" })).toEqual([{ item: "only-entry" }]);
    expect(await receiving._current({ person: "dave" })).toEqual([expiredWindow]);
    expect(await receiving._active({ person: "dave" })).toEqual([]);
    expect(await receiving._expired({})).toEqual([{ window: expiredWindow.window }]);
    expect(await receiving._hasPending({ recipient: "dave" })).toEqual({ waiting: false });
    const stored = await database!.db.collection<ReceivingDocument>("receiving_recipients").findOne({ _id: "bob" });
    expect(stored?.window?.startedAt).toBeInstanceOf(Date);
    expect(stored?.window?.expiresAt).toBeInstanceOf(Date);
    expect(await database!.db.collection("schema_migrations").countDocuments({})).toBe(1);
  });

  test("rerunning keeps changes made by the new concept and does not repeat the import", async () => {
    await seedLegacy();
    await migrateReceiving(database!.db);
    const receiving = new Receiving(database!.db, () => instant);
    const current = await receiving.open({ person: "bob" });
    await receiving.close({ person: "bob", window: current.window });
    await receiving.enqueue({ recipient: "bob", item: "new-schema-item" });
    const before = await snapshot();
    expect(await migrateReceiving(database!.db)).toEqual({
      alreadyApplied: true, recipients: 0, entries: 0, windows: 0,
    });
    expect(await snapshot()).toEqual(before);
    expect(await receiving._current({ person: "bob" })).toEqual([]);
    expect(await receiving._status({ recipient: "bob", item: "message-pending" })).toEqual({ status: "RELEASED" });
    expect(await receiving._status({ recipient: "bob", item: "new-schema-item" })).toEqual({ status: "PENDING" });
  });

  test("an existing recipient is not overwritten when a prior partial import has no completion marker", async () => {
    await seedLegacy();
    const receiving = new Receiving(database!.db, () => instant);
    await receiving.enqueue({ recipient: "bob", item: "already-upgraded" });
    const current = await receiving.open({ person: "bob" });
    const target = database!.db.collection<ReceivingDocument>("receiving_recipients");
    const before = await target.findOne({ _id: "bob" });
    expect(await database!.db.collection("schema_migrations").countDocuments({})).toBe(0);
    await migrateReceiving(database!.db);
    expect(await target.findOne({ _id: "bob" })).toEqual(before);
    expect(await receiving._current({ person: "bob" })).toEqual([current]);
    expect(await receiving._released({ recipient: "bob" })).toEqual([{ item: "already-upgraded" }]);
    expect(await receiving._status({ recipient: "bob", item: "message-pending" })).toEqual({ status: "ABSENT" });
    expect(await receiving._pending({ recipient: "carol" })).toEqual([{ item: "only-entry" }]);
    expect(await target.countDocuments({})).toBe(3);
  });

  test("a fresh database is safely marked complete and repeated runs remain empty", async () => {
    expect(await migrateReceiving(database!.db)).toEqual({
      alreadyApplied: false, recipients: 0, entries: 0, windows: 0,
    });
    const before = await snapshot();
    expect(await migrateReceiving(database!.db)).toEqual({
      alreadyApplied: true, recipients: 0, entries: 0, windows: 0,
    });
    expect(await snapshot()).toEqual(before);
    expect(await database!.db.collection("receiving_recipients").countDocuments({})).toBe(0);
    expect(await new Receiving(database!.db, () => instant)._active({ person: "unknown" })).toEqual([]);
  });

  test("concurrent migration attempts produce one copy of each recipient and one completion marker", async () => {
    await seedLegacy();
    const before = await snapshot(preservedCollections);
    const results = await Promise.all(Array.from({ length: 6 }, () => migrateReceiving(database!.db)));
    expect(results.some(result => !result.alreadyApplied)).toBe(true);
    expect(await snapshot(preservedCollections)).toEqual(before);
    const target = await database!.db.collection<ReceivingDocument>("receiving_recipients").find({}).toArray();
    expect(target).toHaveLength(3);
    expect(target.reduce((sum, record) => sum + record.entries.length, 0)).toBe(3);
    expect(await database!.db.collection("schema_migrations").countDocuments({})).toBe(1);
    const receiving = new Receiving(database!.db, () => instant);
    expect(await receiving._pending({ recipient: "bob" })).toEqual([{ item: "message-pending" }]);
    expect(await receiving._released({ recipient: "bob" })).toEqual([{ item: "message-released" }]);
    expect(await receiving._current({ person: "bob" })).toEqual([activeWindow]);
  }, 15_000);
});

const invalidSnapshots: { name: string; entries?: Document[]; windows?: Document[] }[] = [
  { name: "an invalid date", windows: [{ ...activeWindow, person: "invalid", startedAt: "not-a-date" }] },
  { name: "a missing date", windows: [{ window: "invalid", person: "invalid", startedAt: activeWindow.startedAt }] },
  { name: "a numeric date", windows: [{ ...activeWindow, person: "invalid", expiresAt: instant }] },
  { name: "zero duration", windows: [{ ...activeWindow, person: "invalid", expiresAt: activeWindow.startedAt }] },
  { name: "negative duration", windows: [{ ...activeWindow, person: "invalid", expiresAt: "2026-10-26T11:59:00.000Z" }] },
  { name: "multiple windows for one person", windows: [
    { ...activeWindow, person: "invalid", window: "one" }, { ...activeWindow, person: "invalid", window: "two" },
  ] },
  { name: "an invalid window owner", windows: [{ ...activeWindow, person: "" }] },
  { name: "an invalid holding status", entries: [{ recipient: "invalid", item: "bad", status: "ABSENT" }] },
  { name: "an invalid item identity", entries: [{ recipient: "invalid", item: "", status: "PENDING" }] },
];

describe("Receiving migration refuses a malformed legacy snapshot before writes", () => {
  for (const fixture of invalidSnapshots) {
    test(fixture.name, async () => {
      // A valid recipient is deliberately encountered before the corrupt row.
      await database!.db.collection("holding_entries").insertOne({ recipient: "valid-first", item: "valid", status: "PENDING" });
      const receiving = new Receiving(database!.db, () => instant);
      await receiving.enqueue({ recipient: "existing-target", item: "preserved" });
      if (fixture.entries) await database!.db.collection("holding_entries").insertMany(fixture.entries);
      if (fixture.windows) await database!.db.collection("receptivity_windows").insertMany(fixture.windows);
      const before = await snapshot();
      await expect(migrateReceiving(database!.db)).rejects.toThrow("Receiving migration stopped:");
      expect(await snapshot()).toEqual(before);
      expect(await database!.db.collection("receiving_recipients").countDocuments({})).toBe(1);
      expect(await database!.db.collection("schema_migrations").countDocuments({})).toBe(0);
      expect(await receiving._status({ recipient: "valid-first", item: "valid" })).toEqual({ status: "ABSENT" });
      expect(await receiving._pending({ recipient: "existing-target" })).toEqual([{ item: "preserved" }]);
    });
  }
});
