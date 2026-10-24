// A compact, versioned format shared by the editor, messages, and server.
// Points are [x, y, milliseconds since this stroke began, pen pressure].
export const DRAWING_WIDTH = 600;
export const DRAWING_HEIGHT = 300;
export const DRAWING_COLORS = ["#173247", "#0b7892", "#c65b57"] as const;
export const MAX_DRAWING_STROKES = 120;
export const MAX_DRAWING_POINTS = 3_000;
export const MAX_DRAWING_BYTES = 96_000;

export type DrawingColor = typeof DRAWING_COLORS[number];
export type DrawingPoint = [x: number, y: number, time: number, pressure: number];
export interface DrawingStroke {
  color: DrawingColor;
  points: DrawingPoint[];
}
export interface Drawing {
  version: 1;
  width: typeof DRAWING_WIDTH;
  height: typeof DRAWING_HEIGHT;
  strokes: DrawingStroke[];
}

function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

/** Validate untrusted JSON and copy only the drawing fields we understand. */
export function normalizeDrawing(value: unknown): Drawing | null {
  if (!record(value, ["version", "width", "height", "strokes"])) return null;
  if (value.version !== 1 || value.width !== DRAWING_WIDTH || value.height !== DRAWING_HEIGHT) return null;
  if (!Array.isArray(value.strokes) || !value.strokes.length || value.strokes.length > MAX_DRAWING_STROKES) return null;

  let totalPoints = 0;
  const strokes: DrawingStroke[] = [];
  for (const stroke of value.strokes) {
    if (!record(stroke, ["color", "points"]) || !DRAWING_COLORS.includes(stroke.color as DrawingColor)) return null;
    if (!Array.isArray(stroke.points) || !stroke.points.length) return null;
    totalPoints += stroke.points.length;
    if (totalPoints > MAX_DRAWING_POINTS) return null;
    let lastTime = 0;
    const points: DrawingPoint[] = [];
    for (const point of stroke.points) {
      if (!Array.isArray(point) || point.length !== 4 || ![0, 1, 2, 3].every(index => typeof point[index] === "number" && Number.isFinite(point[index]))) return null;
      const [x, y, time, pressure] = point as DrawingPoint;
      if (x < 0 || x > DRAWING_WIDTH || y < 0 || y > DRAWING_HEIGHT
        || time < lastTime || time > 900_000 || pressure < 0 || pressure > 1) return null;
      points.push([x, y, time, pressure]);
      lastTime = time;
    }
    strokes.push({ color: stroke.color as DrawingColor, points });
  }
  const drawing: Drawing = { version: 1, width: DRAWING_WIDTH, height: DRAWING_HEIGHT, strokes };
  return new TextEncoder().encode(JSON.stringify(drawing)).byteLength <= MAX_DRAWING_BYTES ? drawing : null;
}
