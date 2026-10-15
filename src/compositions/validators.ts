import type { EndpointOptions } from "@mit-sdg/sync-engine/boundary";

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
        if (Object.keys(input).some((key) => !(key in fields))) return { ok: false };
        return { ok: true };
      },
    },
  };
}
export const credentials = { username: 100, password: 128 };
