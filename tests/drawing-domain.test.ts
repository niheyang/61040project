import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { InvalidDrawing, InvalidMessageText, MessageToSelf, Messaging } from "../src/concepts/Messaging.ts";
import {
  DRAWING_COLORS, DRAWING_HEIGHT, DRAWING_WIDTH, MAX_DRAWING_POINTS, MAX_DRAWING_STROKES,
  type Drawing, type DrawingPoint, type DrawingStroke,
} from "../src/shared/drawing.ts";
import { invalidDrawingCases, sampleDrawing } from "./drawing-fixtures.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let database: TestDb | undefined;

beforeAll(async () => {
  database = await openTestDb();
}, 15_000);

beforeEach(async () => {
  // Only clear this suite's randomly named test database.
  await database!.db.collection("messaging_messages").deleteMany({});
});

afterAll(async () => {
  await database?.close();
});

async function participants(messaging: Messaging) {
  return {
    aliceSent: await messaging._sent({ user: "alice" }),
    bobSent: await messaging._sent({ user: "bob" }),
    aliceReceived: await messaging._addressedTo({ user: "alice" }),
    bobReceived: await messaging._addressedTo({ user: "bob" }),
  };
}

describe("Messaging drawing content", () => {
  test("preserves original multicolor strokes and participants through an exchange and a new concept instance", async () => {
    const messaging = new Messaging(database!.db);
    const drawing = sampleDrawing();
    const startedAt = Date.now();
    const sent = await messaging.sendDrawing({ sender: "alice", recipient: "bob", drawing });
    const replyDrawing = sampleDrawing();
    replyDrawing.strokes[0]!.color = DRAWING_COLORS[2];
    const reply = await messaging.sendDrawing({ sender: "bob", recipient: "alice", drawing: replyDrawing });

    const [original] = await messaging._get(sent);
    expect(original).toMatchObject({ ...sent, sender: "alice", recipient: "bob", text: "", drawing });
    expect(Date.parse(original!.createdAt)).toBeGreaterThanOrEqual(startedAt);
    expect(Date.parse(original!.createdAt)).toBeLessThanOrEqual(Date.now());
    expect(original).not.toHaveProperty("_id");
    expect((await messaging._get(reply))[0]).toMatchObject({ ...reply, sender: "bob", recipient: "alice", drawing: replyDrawing });
    expect(await messaging._sent({ user: "alice" })).toEqual([original!]);
    expect(await messaging._addressedTo({ user: "bob" })).toEqual([original!]);
    expect((await messaging._sent({ user: "bob" })).map(row => row.message)).toEqual([reply.message]);
    expect((await messaging._addressedTo({ user: "alice" })).map(row => row.message)).toEqual([reply.message]);
    expect(await messaging._addressedTo({ user: "eve" })).toEqual([]);
    expect(await messaging._get({ message: "unknown-drawing" })).toEqual([]);

    const restarted = new Messaging(database!.db);
    expect(await restarted._get(sent)).toEqual([original!]);
    expect(await participants(restarted)).toEqual(await participants(messaging));
  });

  test("persisted drawings remain unchanged when caller data or a returned record is edited", async () => {
    const messaging = new Messaging(database!.db);
    const drawing = sampleDrawing();
    const expected = structuredClone(drawing);
    const sent = await messaging.sendDrawing({ sender: "alice", recipient: "bob", drawing });
    const [original] = await messaging._get(sent);

    drawing.strokes[0]!.points[0]![0] = DRAWING_WIDTH;
    drawing.strokes[0]!.color = DRAWING_COLORS[2];
    drawing.strokes.push({ color: DRAWING_COLORS[1], points: [[1, 1, 0, 0.5]] });
    original!.drawing!.strokes[0]!.points[0]![1] = DRAWING_HEIGHT;
    original!.text = "A local edit must not change the saved message";

    const [persisted] = await new Messaging(database!.db)._get(sent);
    expect(persisted!.drawing).toEqual(expected);
    expect(persisted!.text).toBe("");
    expect(persisted!.createdAt).toBe(original!.createdAt);
    expect((await messaging._addressedTo({ user: "bob" }))[0]!.drawing).toEqual(expected);
  });

  test("repeated sends create distinct immutable messages instead of overwriting or merging a drawing", async () => {
    const messaging = new Messaging(database!.db);
    const drawing = sampleDrawing();
    const first = await messaging.sendDrawing({ sender: "alice", recipient: "bob", drawing });
    const second = await messaging.sendDrawing({ sender: "alice", recipient: "bob", drawing });

    expect(second.message).not.toBe(first.message);
    const received = await messaging._addressedTo({ user: "bob" });
    expect(received.map(row => row.message).sort()).toEqual([first.message, second.message].sort());
    expect(received.map(row => row.drawing)).toEqual([drawing, drawing]);
  });

  test("accepts boundary coordinates, pressure endpoints, and the maximum supported stroke count", async () => {
    const messaging = new Messaging(database!.db);
    const drawing: Drawing = {
      version: 1, width: DRAWING_WIDTH, height: DRAWING_HEIGHT,
      strokes: Array.from({ length: MAX_DRAWING_STROKES }, (_, index): DrawingStroke => ({
        color: DRAWING_COLORS[index % DRAWING_COLORS.length]!,
        points: index % 2 ? [[DRAWING_WIDTH, DRAWING_HEIGHT, 0, 1]] : [[0, 0, 0, 0]],
      })),
    };

    const sent = await messaging.sendDrawing({ sender: "alice", recipient: "bob", drawing });
    expect((await messaging._get(sent))[0]!.drawing).toEqual(drawing);
  });

  test("accepts a drawing at the point-count limit when the encoded data remains within its byte limit", async () => {
    const messaging = new Messaging(database!.db);
    const drawing: Drawing = {
      version: 1, width: DRAWING_WIDTH, height: DRAWING_HEIGHT,
      strokes: [{
        color: DRAWING_COLORS[0],
        points: Array.from({ length: MAX_DRAWING_POINTS }, (_, index): DrawingPoint => [index % DRAWING_WIDTH, index % DRAWING_HEIGHT, index, 0.5]),
      }],
    };

    const sent = await messaging.sendDrawing({ sender: "alice", recipient: "bob", drawing });
    expect((await messaging._get(sent))[0]!.drawing).toEqual(drawing);
  });

  test("keeps text and drawing messages compatible in one conversation", async () => {
    const messaging = new Messaging(database!.db);
    const text = await messaging.send({ sender: "alice", recipient: "bob", text: "  A typed note  " });
    const drawing = sampleDrawing();
    const drawn = await messaging.sendDrawing({ sender: "alice", recipient: "bob", drawing });

    expect((await messaging._get(text))[0]).toMatchObject({ ...text, text: "A typed note", drawing: null });
    expect((await messaging._get(drawn))[0]).toMatchObject({ ...drawn, text: "", drawing });
    const before = await participants(messaging);
    await expect(messaging.send({ sender: "alice", recipient: "bob", text: " \n " })).rejects.toBeInstanceOf(InvalidMessageText);
    await expect(messaging.send({ sender: "alice", recipient: "bob", text: "x".repeat(2_001) })).rejects.toBeInstanceOf(InvalidMessageText);
    expect(await participants(messaging)).toEqual(before);
    expect((await new Messaging(database!.db)._sent({ user: "alice" })).map(row => row.message).sort()).toEqual([text.message, drawn.message].sort());
  });

  test("refuses a self-addressed drawing without changing an existing conversation", async () => {
    const messaging = new Messaging(database!.db);
    await messaging.sendDrawing({ sender: "alice", recipient: "bob", drawing: sampleDrawing() });
    const before = await participants(messaging);
    const attempted = messaging.sendDrawing({ sender: "alice", recipient: "alice", drawing: sampleDrawing() });

    await expect(attempted).rejects.toBeInstanceOf(MessageToSelf);
    await expect(attempted).rejects.toMatchObject({ code: "MESSAGE_TO_SELF" });
    expect(await participants(messaging)).toEqual(before);
  });

  for (const { name, value } of invalidDrawingCases()) {
    test(`refuses ${name} without mutating existing messages`, async () => {
      const messaging = new Messaging(database!.db);
      await messaging.sendDrawing({ sender: "alice", recipient: "bob", drawing: sampleDrawing() });
      await messaging.send({ sender: "bob", recipient: "alice", text: "Keep this earlier reply" });
      const before = await participants(messaging);
      // Deliberately bypass static types to exercise the concept's runtime refusal.
      const attempted = messaging.sendDrawing({ sender: "alice", recipient: "bob", drawing: value as Drawing });

      await expect(attempted).rejects.toBeInstanceOf(InvalidDrawing);
      await expect(attempted).rejects.toMatchObject({ code: "INVALID_DRAWING" });
      expect(await participants(messaging)).toEqual(before);
    });
  }
});
