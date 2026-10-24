import {
  DRAWING_COLORS, DRAWING_HEIGHT, DRAWING_WIDTH, MAX_DRAWING_BYTES,
  MAX_DRAWING_POINTS, MAX_DRAWING_STROKES, type Drawing, type DrawingPoint,
} from "../src/shared/drawing.ts";

/** Small, fresh payload for each test; never reads the user's messages. */
export function sampleDrawing(): Drawing {
  return {
    version: 1, width: DRAWING_WIDTH, height: DRAWING_HEIGHT,
    strokes: [
      { color: DRAWING_COLORS[0], points: [[24, 40, 0, 0.5], [80, 90, 25, 0.6], [140, 40, 50, 0.4]] },
      { color: DRAWING_COLORS[1], points: [[200, 100, 0, 0.5], [260, 160, 35, 0.7]] },
    ],
  };
}

/** Distinct invalid classes, rather than many copies of the same empty input. */
export function invalidDrawingCases(): Array<{ name: string; value: unknown }> {
  const withStroke = (stroke: unknown) => ({ ...sampleDrawing(), strokes: [stroke] });
  const withPoints = (points: unknown) => withStroke({ color: DRAWING_COLORS[0], points });
  // Within the point/stroke count limits, but deliberately beyond the byte cap.
  const verbosePoints = Array.from({ length: MAX_DRAWING_POINTS }, (_, index): DrawingPoint => [
    123.1234567890123, 234.2345678901234, index, 0.123456789012345,
  ]);
  const tooManyBytes = withPoints(verbosePoints);
  if (new TextEncoder().encode(JSON.stringify(tooManyBytes)).byteLength <= MAX_DRAWING_BYTES) {
    throw new Error("The oversized-byte fixture must exceed the drawing byte limit.");
  }
  return [
    { name: "null", value: null },
    { name: "array instead of drawing", value: [] },
    { name: "empty drawing", value: { ...sampleDrawing(), strokes: [] } },
    { name: "empty stroke", value: withPoints([]) },
    { name: "unsupported version", value: { ...sampleDrawing(), version: 2 } },
    { name: "wrong dimensions", value: { ...sampleDrawing(), height: 600 } },
    { name: "unexpected drawing field", value: { ...sampleDrawing(), imageUrl: "https://example.invalid/image.png" } },
    { name: "unexpected stroke field", value: withStroke({ color: DRAWING_COLORS[0], points: [[1, 1, 0, 0.5]], sender: "spoofed" }) },
    { name: "unsupported ink", value: withStroke({ color: "#ffffff", points: [[1, 1, 0, 0.5]] }) },
    { name: "non-numeric point", value: withPoints([["24", 40, 0, 0.5]]) },
    { name: "non-finite coordinate", value: withPoints([[Infinity, 40, 0, 0.5]]) },
    { name: "wrong point length", value: withPoints([[24, 40, 0]]) },
    { name: "negative coordinate", value: withPoints([[-1, 40, 0, 0.5]]) },
    { name: "coordinate outside canvas", value: withPoints([[DRAWING_WIDTH + 1, 40, 0, 0.5]]) },
    { name: "decreasing time", value: withPoints([[24, 40, 20, 0.5], [25, 40, 10, 0.5]]) },
    { name: "negative time", value: withPoints([[24, 40, -1, 0.5]]) },
    { name: "excessive stroke duration", value: withPoints([[24, 40, 900_001, 0.5]]) },
    { name: "pressure outside range", value: withPoints([[24, 40, 0, 1.1]]) },
    { name: "too many strokes", value: { ...sampleDrawing(), strokes: Array.from({ length: MAX_DRAWING_STROKES + 1 }, () => ({ color: DRAWING_COLORS[0], points: [[1, 1, 0, 0.5]] })) } },
    { name: "too many points", value: withPoints(Array.from({ length: MAX_DRAWING_POINTS + 1 }, (_, index) => [1, 1, index, 0.5])) },
    { name: "too many bytes", value: tooManyBytes },
  ];
}
