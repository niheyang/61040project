import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Bookmarking } from "../src/concepts/Bookmarking.ts";
import { InvalidMessageText, MessageToSelf, Messaging } from "../src/concepts/Messaging.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let database: TestDb;

beforeAll(async () => {
  database = await openTestDb();
}, 15_000);

beforeEach(async () => {
  await Promise.all([
    database.db.collection("messaging_messages").deleteMany({}),
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
