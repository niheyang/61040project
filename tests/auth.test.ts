import { afterAll, beforeAll, expect, test } from "bun:test";
import { PasswordAuthenticatingConcept, InvalidCredentials, UsernameTaken } from "../src/concepts/PasswordAuthenticating.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let database: TestDb;
beforeAll(async () => { database = await openTestDb(); });
afterAll(async () => { await database.close(); });

test("registration stores a hash and a new instance authenticates the same identity", async () => {
  const auth = new PasswordAuthenticatingConcept(database.db);
  const account = await auth.register({ username: " Alice ", password: "test-password" });
  expect(account.username).toBe("alice");
  const stored = await database.db.collection("auth.users").findOne({ username: "alice" });
  expect(stored?.passwordHash).not.toBe("test-password");
  expect(stored?.passwordHash).toStartWith("$argon2id$");
  const restarted = new PasswordAuthenticatingConcept(database.db);
  expect(await restarted.authenticate({ username: "ALICE", password: "test-password" })).toEqual(account);
  await expect(restarted.authenticate({ username: "alice", password: "wrong-password" })).rejects.toBeInstanceOf(InvalidCredentials);
});

test("concurrent registration cannot create duplicate canonical usernames", async () => {
  const auth = new PasswordAuthenticatingConcept(database.db);
  const results = await Promise.allSettled([
    auth.register({ username: "same_user", password: "test-password" }),
    auth.register({ username: "SAME_USER", password: "test-password" }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const failure = results.find((r) => r.status === "rejected");
  expect(failure?.status === "rejected" && failure.reason).toBeInstanceOf(UsernameTaken);
});
