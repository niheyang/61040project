import type { Options, PointGroup, PointGroupOptions } from "signature_pad";
import {
  DRAWING_COLORS, DRAWING_HEIGHT, DRAWING_WIDTH, normalizeDrawing,
  type Drawing, type DrawingColor, type DrawingPoint,
} from "../../src/shared/drawing.ts";

export const DRAWING_PAPER = "#fffdf3";

// The editor and received drawings use the same pen settings. Library-specific
// options are reconstructed here rather than accepted from stored messages.
function strokeOptions(scale: number, color: DrawingColor): PointGroupOptions {
  return {
    penColor: color,
    minWidth: 1.5 * scale,
    maxWidth: 2.5 * scale,
    dotSize: 1.5 * scale,
    velocityFilterWeight: 0.7,
    compositeOperation: "source-over",
  };
}

export function drawingPadOptions(scale = 1, color: DrawingColor = DRAWING_COLORS[0]): Options {
  // No trailing throttled callback can resume drawing after the pad is disabled
  // or restored. Minimum-distance sampling still limits redundant points.
  return { ...strokeOptions(scale, color), minDistance: 1.5 * scale, throttle: 0 };
}

export function drawingPointGroups(drawing: Drawing, scale: number): PointGroup[] {
  return drawing.strokes.map(stroke => ({
    ...strokeOptions(scale, stroke.color),
    points: stroke.points.map(([x, y, time, pressure]) => ({
      // Signature Pad treats zero as an absent timestamp. Keep relative
      // differences while making the first timestamp nonzero for replay.
      x: x * scale, y: y * scale, time: time + 1, pressure,
    })),
  }));
}

/** Convert display-sized pen movements to the fixed 600 × 300 drawing format. */
export function snapshotDrawing(groups: PointGroup[], scale: number): Drawing | null {
  if (!Number.isFinite(scale) || scale <= 0) return null;
  return normalizeDrawing({
    version: 1,
    width: DRAWING_WIDTH,
    height: DRAWING_HEIGHT,
    strokes: groups.map(group => {
      const startedAt = group.points[0]?.time ?? 0;
      let previousTime = 0;
      return {
        color: group.penColor,
        points: group.points.map((point): DrawingPoint => {
          const time = Math.max(previousTime, Math.round(point.time - startedAt));
          previousTime = time;
          return [
            Math.round(Math.min(DRAWING_WIDTH, Math.max(0, point.x / scale)) * 100) / 100,
            Math.round(Math.min(DRAWING_HEIGHT, Math.max(0, point.y / scale)) * 100) / 100,
            time,
            Number.isFinite(point.pressure) ? Math.round(Math.min(1, Math.max(0, point.pressure)) * 1_000) / 1_000 : 0,
          ];
        }),
      };
    }),
  });
}

/** Size the backing pixels for a sharp canvas, keeping pointer coordinates in CSS pixels. */
export function sizeDrawingCanvas(canvas: HTMLCanvasElement): number | null {
  const width = canvas.getBoundingClientRect().width;
  if (width <= 0) return null;
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(width * DRAWING_HEIGHT / DRAWING_WIDTH * ratio);
  canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return width / DRAWING_WIDTH;
}
