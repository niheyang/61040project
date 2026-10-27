import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createCatchupHandler } from "../src/server.ts";
import { sampleDrawing } from "./drawing-fixtures.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

interface Account { user: string; username: string }
type Handler = ReturnType<typeof createCatchupHandler>;
const credentials = (username: string) => ({ username, password: "access-test-password" });
let database: TestDb | undefined;
let handler: Handler | undefined;
let bob: Account;

async function request(path: string, input: unknown, headers: HeadersInit = {}) {
  if (!handler) throw new Error("Access-control test handler is not started");
  return handler.handle(new Request(`https://catchup.test/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(input),
  }));
}

async function post<T>(path: string, input: unknown): Promise<T> {
  const response = await request(`catchup/${path}`, input);
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body).not.toHaveProperty("error");
  return body as T;
}

async function denied(path: string, input: unknown, status: number, error: string) {
  const response = await request(`catchup/${path}`, input);
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error });
}

async function storedState() {
  if (!database) throw new Error("Access-control test DB is not started");
  const names = ["auth.users", "messaging_messages", "receiving_recipients", "bookmarking_saved"];
  return Promise.all(names.map(name => database!.db.collection(name).find({}).sort({ _id: 1 }).toArray()));
}

beforeEach(async () => {
  database = await openTestDb();
  handler = createCatchupHandler(database.db);
  await post<Account>("register", credentials("alice"));
  bob = await post<Account>("register", credentials("bob"));
  await post<Account>("register", credentials("eve"));
}, 30_000);

afterEach(async () => {
  try {
    await handler?.close();
  } finally {
    handler = undefined;
    await database?.close();
    database = undefined;
  }
}, 30_000);

describe("authentication and access-control boundary", () => {
  test("every protected endpoint refuses missing credentials, wrong identities, and forged actors without mutation", async () => {
    const { message } = await post<{ message: string }>("send", {
      ...credentials("alice"), recipientUsername: "bob", text: "Only Bob can receive this",
    });
    const { window } = await post<{ window: string }>("startCatchup", credentials("bob"));
    await post("save", { ...credentials("bob"), message });
    const before = await storedState();
    const endpoints: [string, Record<string, unknown>][] = [
      ["checkUsername", { recipientUsername: "bob" }],
      ["checkUpdates", {}],
      ["dashboard", {}],
      ["send", { recipientUsername: "bob", text: "Unauthorized text" }],
      ["sendDrawing", { recipientUsername: "bob", drawing: sampleDrawing() }],
      ["startCatchup", {}],
      ["endCatchup", { window }],
      ["save", { message }],
      ["removeSaved", { message }],
      ["viewMessage", { message }],
    ];
    for (const [path, input] of endpoints) {
      await denied(path, { username: "eve", ...input }, 400, "INVALID_REQUEST");
      await denied(path, { username: "eve", password: "wrong-password", ...input }, 401, "UNAUTHORIZED");
      await denied(path, { ...credentials("missing_user"), ...input }, 401, "UNAUTHORIZED");
      // Neither a forged owner nor a forged sender can replace the acting user.
      await denied(path, { ...credentials("eve"), ...input, person: bob.user, sender: bob.user }, 400, "INVALID_REQUEST");
    }
    expect(await storedState()).toEqual(before);
  }, 60_000);

  test("another account cannot release, read, save, close, or remove a recipient's private data", async () => {
    const text = await post<{ message: string }>("send", {
      ...credentials("alice"), recipientUsername: "bob", text: "Private text",
    });
    const drawing = await post<{ message: string }>("sendDrawing", {
      ...credentials("alice"), recipientUsername: "bob", drawing: sampleDrawing(),
    });
    await post("startCatchup", credentials("eve"));
    const hidden = await post("dashboard", credentials("bob"));
    expect(hidden).toEqual({ incoming: [], sent: [], saved: [], windows: [] });
    for (const sent of [text, drawing]) {
      await denied("viewMessage", { ...credentials("bob"), ...sent }, 403, "FORBIDDEN");
      await denied("save", { ...credentials("bob"), ...sent }, 403, "FORBIDDEN");
    }

    const { window } = await post<{ window: string }>("startCatchup", credentials("bob"));
    for (const sent of [text, drawing]) {
      await post("viewMessage", { ...credentials("bob"), ...sent });
      await post("save", { ...credentials("bob"), ...sent });
      // Sending a message does not grant the sender access to the recipient-only endpoint.
      for (const username of ["alice", "eve"]) {
        await denied("viewMessage", { ...credentials(username), ...sent }, 403, "FORBIDDEN");
        await denied("save", { ...credentials(username), ...sent }, 403, "FORBIDDEN");
      }
    }
    const before = await post("dashboard", credentials("bob"));
    await post("endCatchup", { ...credentials("eve"), window });
    await post("removeSaved", { ...credentials("eve"), ...text });
    await post("removeSaved", { ...credentials("alice"), ...drawing });
    expect(await post("dashboard", credentials("bob"))).toEqual(before);

    const response = await request("catchup/dashboard", credentials("eve"), {
      Authorization: `Bearer ${bob.user}`, Cookie: `user=${bob.user}`,
    });
    const own = await response.json();
    expect(response.status).toBe(200);
    expect(own.incoming).toEqual([]);
    expect(own.sent).toEqual([]);
    expect(own.saved).toEqual([]);
    expect(own.windows).toHaveLength(1);
    expect(own.windows[0].person).not.toBe(bob.user);
  }, 60_000);

  test("private API successes and failures explicitly prohibit HTTP caching", async () => {
    const sent = await post<{ message: string }>("send", {
      ...credentials("alice"), recipientUsername: "bob", text: "Private cached content",
    });
    await post("startCatchup", credentials("bob"));
    const cases: [string, unknown, number][] = [
      ["register", credentials("carol"), 200],
      ["login", credentials("bob"), 200],
      ["dashboard", credentials("bob"), 200],
      ["viewMessage", { ...credentials("bob"), ...sent }, 200],
      ["login", { ...credentials("bob"), password: "wrong-password" }, 401],
      ["viewMessage", { ...credentials("eve"), ...sent }, 403],
      ["dashboard", { username: "bob" }, 400],
      ["unknown", credentials("bob"), 404],
    ];
    for (const [path, input, status] of cases) {
      const response = await request(`catchup/${path}`, input);
      expect(response.status).toBe(status);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      const body = await response.json();
      expect(JSON.stringify(body)).not.toContain("password");
    }
  }, 30_000);

  test("internal concept actions and views are not exposed as HTTP routes", async () => {
    const before = await storedState();
    for (const path of ["Messaging/send", "Messaging/_get", "Receiving/enqueue", "Receiving/open", "catchup/AccessibleMessage"]) {
      const response = await request(path, { ...credentials("eve"), person: bob.user, recipient: bob.user });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "NOT_FOUND" });
    }
    expect(await storedState()).toEqual(before);
  }, 30_000);
});
