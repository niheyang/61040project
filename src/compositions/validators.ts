import type { EndpointOptions } from "@mit-sdg/sync-engine/boundary";
import { normalizeDrawing } from "../shared/drawing.ts";

/** Generated TypeScript types do not validate untyped JSON requests. */
export function stringInput(fields: Record<string, number>): EndpointOptions {
  return {
    input: { required: Object.keys(fields) },
    validators: {
      input(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false };
        const input = value as Record<string, unknown>;
        for (const [key, max] of Object.entries(fields)) {
          const field = input[key];
          if (typeof field !== "string" || field.length > max) return { ok: false };
        }
        // Clients cannot supply an extra sender, recipient ID, or bookmark owner.
        if (Object.keys(input).some((key) => !Object.hasOwn(fields, key))) return { ok: false };
        return { ok: true };
      },
    },
  };
}
export const credentials = { username: 100, password: 128 };

/** Accept only credentials, an exact recipient username, and validated stroke data. */
export function drawingInput(): EndpointOptions {
  const fields = { ...credentials, recipientUsername: 100 };
  return {
    input: { required: [...Object.keys(fields), "drawing"] },
    validators: {
      input(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false };
        const input = value as Record<string, unknown>;
        for (const [key, max] of Object.entries(fields)) {
          const field = input[key];
          if (typeof field !== "string" || field.length > max) return { ok: false };
        }
        if (Object.keys(input).some((key) => key !== "drawing" && !Object.hasOwn(fields, key))) {
          return { ok: false };
        }
        return { ok: normalizeDrawing(input.drawing) !== null };
      },
    },
  };
}
