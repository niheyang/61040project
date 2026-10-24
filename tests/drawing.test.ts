import { describe, expect, test } from "bun:test";
import { normalizeDrawing, DRAWING_COLORS, DRAWING_HEIGHT, DRAWING_WIDTH, MAX_DRAWING_STROKES } from "../src/shared/drawing.ts";
import { drawingPointGroups, snapshotDrawing } from "../web/src/drawingCanvas.ts";
import { buildConversations } from "../web/src/conversations.ts";
import { searchConversations } from "../web/src/search.ts";
import type { Dashboard, MessageRow } from "../web/src/api.ts";
import { invalidDrawingCases, sampleDrawing } from "./drawing-fixtures.ts";

describe("drawing format", () => {
  test("accepts boundary coordinates, zero/full pressure, a dot, and the stroke-count limit", () => {
    const drawing = sampleDrawing();
    drawing.strokes = Array.from({ length: MAX_DRAWING_STROKES }, (_, index) => ({
      color: DRAWING_COLORS[index % DRAWING_COLORS.length]!,
      points: [[index % 2 ? DRAWING_WIDTH : 0, index % 2 ? DRAWING_HEIGHT : 0, 0, index % 2]],
    }));
    expect(normalizeDrawing(drawing)).toEqual(drawing);
  });

  test("rejects each malformed or excessive drawing class", () => {
    for (const { name, value } of invalidDrawingCases()) {
      expect(normalizeDrawing(value), name).toBeNull();
    }
  });

  test("returns a detached drawing without changing the caller's data", () => {
    const input = sampleDrawing();
    const before = structuredClone(input);
    const output = normalizeDrawing(input)!;
    expect(input).toEqual(before);
    expect(output).toEqual(before);
    expect(output).not.toBe(input);
    expect(output.strokes[0]!.points[0]).not.toBe(input.strokes[0]!.points[0]);
    output.strokes[0]!.points[0]![0] = 500;
    expect(input).toEqual(before);
  });

  test("rejects sparse and non-finite direct-call points, beyond JSON's ordinary inputs", () => {
    for (const point of [Array(4), [1, 2, NaN, 0.5], [1, 2, 0, -Infinity]]) {
      const drawing = { ...sampleDrawing(), strokes: [{ color: DRAWING_COLORS[0], points: [point] }] };
      expect(normalizeDrawing(drawing)).toBeNull();
    }
  });
});

describe("drawing editor serialization", () => {
  test("preserves ink, relative timing, pressure, and geometry through display-size round trips", () => {
    const drawing = sampleDrawing();
    for (const scale of [0.4, 1, 1.5]) {
      const groups = drawingPointGroups(drawing, scale);
      expect(groups.map(group => group.penColor)).toEqual(drawing.strokes.map(stroke => stroke.color));
      // Signature Pad interprets a zero timestamp as Date.now(); prevent that
      // sentinel from changing replay velocity after resizing or receiving.
      expect(groups.every(group => group.points[0]!.time > 0)).toBe(true);
      expect(snapshotDrawing(groups, scale)).toEqual(drawing);
    }
  });

  test("an empty pad or invalid scale cannot become a sendable drawing", () => {
    expect(snapshotDrawing([], 1)).toBeNull();
    const groups = drawingPointGroups(sampleDrawing(), 1);
    for (const scale of [0, -1, NaN, Infinity]) expect(snapshotDrawing(groups, scale)).toBeNull();
  });
});

describe("drawing conversation previews and search", () => {
  test("a drawing has a [Drawing] preview, while only usernames and typed content are searched", () => {
    const drawingMessage: MessageRow = {
      message: "drawing-message", sender: "alice-id", recipient: "bob-id",
      senderUsername: "alice", recipientUsername: "bob", text: "", drawing: sampleDrawing(),
      createdAt: "2026-10-23T12:00:00.000Z",
    };
    const textMessage: MessageRow = { ...drawingMessage, message: "typed-message", drawing: null, text: "Meet near the lake", createdAt: "2026-10-23T11:00:00.000Z" };
    const dashboard: Dashboard = { incoming: [textMessage, drawingMessage], sent: [], saved: [], windows: [] };
    const chats = buildConversations(dashboard);
    expect(searchConversations(chats, "")[0]?.previewText).toBe("[Drawing]");
    expect(searchConversations(chats, "ALICE")[0]).toMatchObject({ previewText: "[Drawing]", matchCount: 0 });
    expect(searchConversations(chats, "lake")[0]?.previewMessage?.message).toBe("typed-message");
    expect(searchConversations(chats, "173247")).toEqual([]);
    expect(searchConversations(chats, "[Drawing]")).toEqual([]);
    // A user may still type this exact label; it remains ordinary message text.
    dashboard.incoming.push({ ...textMessage, message: "literal-label", text: "[Drawing]", createdAt: "2026-10-23T12:01:00.000Z" });
    expect(searchConversations(buildConversations(dashboard), "[Drawing]")[0]?.previewMessage?.message).toBe("literal-label");
  });
});
