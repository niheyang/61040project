import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { CatchupWireHttp } from "../../generated/wire.ts";

// Generated from the backend endpoints: changing an endpoint also changes
// the types checked here and in our Vue components.
export const api = createHttpClient<CatchupWireHttp>({ baseUrl: "/api" });

export type Dashboard = CatchupWireHttp["/catchup/dashboard"]["output"];
export type MessageRow = Dashboard["incoming"][number];
export type SentRow = Dashboard["sent"][number];
export type WindowRow = Dashboard["windows"][number];
export type Credentials = { username: string; password: string };

export function isApiError(value: unknown): value is { error: string; detail?: string } {
  return typeof value === "object" && value !== null && "error" in value;
}

const friendlyErrors: Record<string, string> = {
  BAD_REQUEST: "Check the form and try again.",
  INVALID_INPUT: "Check the form and try again.",
  INVALID_REQUEST: "Check the form and try again.",
  CONFLICT: "That username is already taken. Choose another one.",
  UNAUTHORIZED: "The username or password is incorrect. Try signing in again.",
  NOT_FOUND: "We couldn't find that username or message.",
  FORBIDDEN: "That message isn't available to your account.",
  UNAVAILABLE: "The database is unavailable. Check that MongoDB is running, then try again.",
  INTERNAL_ERROR: "Something went wrong on the server. Please try again.",
  NETWORK_ERROR: "Couldn't reach Catchup. Check that the backend is running, then try again.",
  TRANSPORT_ERROR: "Couldn't reach Catchup. Please try again.",
  TIMED_OUT: "That request took too long. Please try again.",
};

export function describeError(value: { error: string; detail?: string }): string {
  return friendlyErrors[value.error] ?? "Something went wrong. Please try again.";
}
