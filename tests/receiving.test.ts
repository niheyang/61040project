import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "mongodb";
import { Receiving, RECEIVING_WINDOW_MS } from "../src/concepts/Receiving.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let database: TestDb;
let now: number;
const recipient = "bob";
const pair = (item: string) => ({ recipient, item });

beforeEach(async () => {
  database = await openTestDb();
  now = Date.parse("2026-10-26T12:00:00.000Z");
}, 15_000);
afterEach(async () => { await database?.close(); });

// Pause the actual storage mutation, after any preceding application reads.
// A second instance can commit while it is paused, exposing stale-read races.
function pauseFirstWrite(db: Db) {
  let resume!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { resume = resolve; });
  let pending = true;
  const delayed = new Proxy(db, {
    get(target, key) {
      if (key === "collection") return (name: string, ...options: unknown[]) => {
        const collection = Reflect.apply(target.collection, target, [name, ...options]);
        if (name !== "receiving_recipients") return collection;
        return new Proxy(collection, {
          get(store, method) {
            const value = Reflect.get(store, method, store);
            if (method === "updateOne" || method === "findOneAndUpdate") {
              return async (...args: unknown[]) => {
                if (pending) { pending = false; entered(); await gate; }
                return Reflect.apply(value, store, args);
              };
            }
            return typeof value === "function" ? value.bind(store) : value;
          },
        });
      };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return {
    db: delayed,
    resume,
    async waitUntilBlocked() {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          blocked,
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("No receiving write reached the barrier")), 5_000); }),
        ]);
      } finally { clearTimeout(timeout); }
    },
  };
}

describe("Receiving", () => {
  test("opening releases held items, arrivals receive only while open, and closing preserves released history", async () => {
    const receiving = new Receiving(database.db, () => now);
    expect(await receiving._status(pair("unknown"))).toEqual({ status: "ABSENT" });
    expect(await receiving._active({ person: recipient })).toEqual([]);
    await receiving.enqueue(pair("first"));
    await receiving.enqueue({ recipient: "alice", item: "private" });
    expect(await receiving._pending({ recipient })).toEqual([{ item: "first" }]);

    const window = await receiving.open({ person: recipient });
    expect(Date.parse(window.expiresAt) - Date.parse(window.startedAt)).toBe(RECEIVING_WINDOW_MS);
    expect(await receiving._active({ person: recipient })).toEqual([window]);
    expect(await receiving._isOpen({ person: recipient })).toEqual({ open: true });
    expect(await receiving._pending({ recipient })).toEqual([]);
    await receiving.enqueue(pair("during"));
    expect(await receiving._status(pair("during"))).toEqual({ status: "RELEASED" });
    await receiving.close({ person: recipient, window: window.window });
    await receiving.enqueue(pair("after"));
    await receiving.enqueue(pair("first"));
    expect(await receiving._released({ recipient })).toEqual([{ item: "during" }, { item: "first" }]);
    expect(await receiving._pending({ recipient })).toEqual([{ item: "after" }]);
    expect(await receiving._pending({ recipient: "alice" })).toEqual([{ item: "private" }]);
    expect(await receiving._hasPending({ recipient })).toEqual({ waiting: true });
    expect(await new Receiving(database.db, () => now)._status(pair("first"))).toEqual({ status: "RELEASED" });
  });

  test("the exact deadline denies arrivals before expiry cleanup, and expiry preserves delivery state", async () => {
    const receiving = new Receiving(database.db, () => now);
    const window = await receiving.open({ person: recipient });
    now = Date.parse(window.expiresAt) - 1;
    await receiving.enqueue(pair("before"));
    await receiving.expire({ window: window.window });
    expect(await receiving._active({ person: recipient })).toEqual([window]);
    expect(await receiving._expired({})).toEqual([]);

    now += 1;
    await receiving.enqueue(pair("at-deadline"));
    expect(await receiving._isOpen({ person: recipient })).toEqual({ open: false });
    expect(await receiving._active({ person: recipient })).toEqual([]);
    expect(await receiving._current({ person: recipient })).toEqual([window]);
    expect(await receiving._expired({})).toEqual([{ window: window.window }]);
    expect(await receiving._status(pair("before"))).toEqual({ status: "RELEASED" });
    expect(await receiving._status(pair("at-deadline"))).toEqual({ status: "PENDING" });
    await receiving.expire({ window: window.window });
    await receiving.expire({ window: window.window });
    expect(await receiving._current({ person: recipient })).toEqual([]);
    expect(await receiving._status(pair("before"))).toEqual({ status: "RELEASED" });
    expect(await receiving._status(pair("at-deadline"))).toEqual({ status: "PENDING" });
  });

  test("stale, unknown, or another person's close and expiry cannot remove a replacement window", async () => {
    const receiving = new Receiving(database.db, () => now);
    const old = await receiving.open({ person: recipient });
    now += 10 * 60 * 1_000;
    const current = await receiving.open({ person: recipient });
    expect(current.window).not.toBe(old.window);
    await receiving.close({ person: recipient, window: old.window });
    await receiving.close({ person: "alice", window: current.window });
    await receiving.close({ person: recipient, window: "unknown" });
    now = Date.parse(old.expiresAt);
    await receiving.expire({ window: old.window });
    await receiving.expire({ window: current.window });
    await receiving.expire({ window: "unknown" });
    expect(await receiving._current({ person: recipient })).toEqual([current]);
    await receiving.close({ person: recipient, window: current.window });
    await receiving.close({ person: recipient, window: current.window });
    expect(await receiving._current({ person: recipient })).toEqual([]);
  });

  test("concurrent first enqueues across raw instances preserve every item and deduplicate repeated handles", async () => {
    const instances = [new Receiving(database.db, () => now), new Receiving(database.db, () => now)];
    const items = Array.from({ length: 18 }, (_, index) => `item-${String(index).padStart(2, "0")}`);
    await Promise.all([...items, ...items].map((item, index) => instances[index % 2]!.enqueue(pair(item))));
    expect(await instances[0]!._pending({ recipient })).toEqual(items.map(item => ({ item })));
    expect(await database.db.collection<{ _id: string }>("receiving_recipients").countDocuments({ _id: recipient })).toBe(1);
    const window = await instances[0]!.open({ person: recipient });
    await instances[1]!.close({ person: recipient, window: window.window });
    await Promise.all(items.map(item => instances[1]!.enqueue(pair(item))));
    expect(await instances[0]!._released({ recipient })).toEqual(items.map(item => ({ item })));
    expect(await instances[0]!._pending({ recipient })).toEqual([]);
  }, 15_000);

  test("an open racing with enqueues across raw instances leaves no pending item stranded", async () => {
    const one = new Receiving(database.db, () => now);
    const two = new Receiving(database.db, () => now);
    await one.enqueue(pair("existing"));
    const items = Array.from({ length: 12 }, (_, index) => `concurrent-${index}`);
    const [window] = await Promise.all([
      one.open({ person: recipient }),
      ...items.map(item => two.enqueue(pair(item))),
    ]);
    expect(await two._pending({ recipient })).toEqual([]);
    expect((await two._released({ recipient })).map(row => row.item)).toEqual(["existing", ...items].sort());
    expect(await two._current({ person: recipient })).toEqual([window]);
  }, 15_000);

  test("simultaneous openings across raw instances leave one current handle that stale closes cannot remove", async () => {
    const instances = [new Receiving(database.db, () => now), new Receiving(database.db, () => now)];
    const opened = await Promise.all(Array.from({ length: 8 }, (_, index) => instances[index % 2]!.open({ person: recipient })));
    const current = await instances[0]!._current({ person: recipient });
    expect(current).toHaveLength(1);
    expect(opened.map(window => window.window)).toContain(current[0]!.window);
    for (const old of opened.filter(window => window.window !== current[0]!.window)) {
      await instances[1]!.close({ person: recipient, window: old.window });
    }
    expect(await instances[0]!._active({ person: recipient })).toEqual(current);
    expect(await database.db.collection<{ _id: string }>("receiving_recipients").countDocuments({ _id: recipient })).toBe(1);
  }, 15_000);

  test("a close committed before an enqueue's storage write prevents a stale open check from releasing it", async () => {
    const regular = new Receiving(database.db, () => now);
    const window = await regular.open({ person: recipient });
    const barrier = pauseFirstWrite(database.db);
    const writing = new Receiving(barrier.db, () => now).enqueue(pair("delayed"));
    try {
      await barrier.waitUntilBlocked();
      await regular.close({ person: recipient, window: window.window });
    } finally { barrier.resume(); await writing; }
    expect(await regular._status(pair("delayed"))).toEqual({ status: "PENDING" });
    expect(await regular._active({ person: recipient })).toEqual([]);
  }, 15_000);

  test("an open delayed before its storage write includes an item enqueued by another instance meanwhile", async () => {
    const regular = new Receiving(database.db, () => now);
    await regular.enqueue(pair("first"));
    const barrier = pauseFirstWrite(database.db);
    const opening = new Receiving(barrier.db, () => now).open({ person: recipient });
    try {
      await barrier.waitUntilBlocked();
      await regular.enqueue(pair("second"));
    } finally { barrier.resume(); await opening; }
    expect(await regular._released({ recipient })).toEqual([{ item: "first" }, { item: "second" }]);
    expect(await regular._pending({ recipient })).toEqual([]);
  }, 15_000);

  test("simultaneous close and enqueue permit either atomic order while a later arrival remains pending", async () => {
    const one = new Receiving(database.db, () => now);
    const two = new Receiving(database.db, () => now);
    const window = await one.open({ person: recipient });
    await one.enqueue(pair("already-released"));
    await Promise.all([
      two.enqueue(pair("racing")),
      one.close({ person: recipient, window: window.window }),
    ]);
    expect(["PENDING", "RELEASED"]).toContain((await one._status(pair("racing"))).status);
    await two.enqueue(pair("later"));
    expect(await one._status(pair("later"))).toEqual({ status: "PENDING" });
    expect(await one._status(pair("already-released"))).toEqual({ status: "RELEASED" });
    await one.open({ person: recipient });
    expect((await one._released({ recipient })).map(row => row.item)).toEqual(["already-released", "later", "racing"]);
    expect(await one._pending({ recipient })).toEqual([]);
  }, 15_000);

  test("opaque dollar-prefixed identities remain literal values in database expressions", async () => {
    const receiving = new Receiving(database.db, () => now);
    const person = "$recipient";
    const items = ["$window", "$$NOW"];
    await receiving.enqueue({ recipient: person, item: items[0]! });
    const window = await receiving.open({ person });
    expect(window.person).toBe(person);
    await receiving.enqueue({ recipient: person, item: items[1]! });
    expect((await receiving._released({ recipient: person })).map(row => row.item)).toEqual([...items].sort());
    await receiving.close({ person, window: window.window });
    expect(await receiving._active({ person })).toEqual([]);
    expect(await receiving._hasPending({ recipient: "other" })).toEqual({ waiting: false });
  });

  test("the default database clock recognizes a window that expired without host cleanup", async () => {
    const historical = new Receiving(database.db, () => Date.now() - 2 * RECEIVING_WINDOW_MS);
    const window = await historical.open({ person: recipient });
    const current = new Receiving(database.db);
    await current.enqueue(pair("after-real-expiry"));
    expect(await current._status(pair("after-real-expiry"))).toEqual({ status: "PENDING" });
    expect(await current._active({ person: recipient })).toEqual([]);
    expect(await current._expired({})).toEqual([{ window: window.window }]);
    await current.expire({ window: window.window });
    expect(await current._current({ person: recipient })).toEqual([]);
  });
});
