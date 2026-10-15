import { httpPolicy } from "@mit-sdg/sync-engine-http/policy";

export const policy = httpPolicy({
  basePath: "/api",
  requestOrigins: { allowed: ["http://127.0.0.1:8080", "http://localhost:8080"] },
  limits: { requestBodyBytes: 12_000 },
  publicErrors: {
    INVALID_USERNAME: "INVALID_REQUEST", INVALID_PASSWORD: "INVALID_REQUEST",
    USERNAME_TAKEN: "CONFLICT", INVALID_CREDENTIALS: "UNAUTHORIZED",
    INVALID_MESSAGE_TEXT: "INVALID_REQUEST", MESSAGE_TO_SELF: "INVALID_REQUEST",
    RECIPIENT_NOT_FOUND: "NOT_FOUND", MESSAGE_UNAVAILABLE: "FORBIDDEN",
  },
});
