import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  PasswordAuthenticatingConcept, InvalidCredentials, InvalidPassword, InvalidUsername, UsernameTaken,
} from "../src/concepts/PasswordAuthenticating.ts";
import { openTestDb, type TestDb } from "./test-db.ts";

let database: TestDb;
beforeEach(async () => { database = await openTestDb(); });
afterEach(async () => { await database?.close(); });

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
  expect(await database.db.collection("auth.users").countDocuments({})).toBe(1);
});

test("registration accepts the username and password length boundaries after username normalization", async () => {
  const auth = new PasswordAuthenticatingConcept(database.db);
  const cases = [
    { username: " AbC ", canonical: "abc", password: "aB1_!?xy" },
    { username: "U".repeat(24), canonical: "u".repeat(24), password: "p".repeat(128) },
  ];
  for (const { username, canonical, password } of cases) {
    const account = await auth.register({ username, password });
    expect(account.username).toBe(canonical);
    expect(await auth.authenticate({ username: ` ${canonical.toUpperCase()} `, password })).toEqual(account);
  }
  expect(await database.db.collection("auth.users").countDocuments({})).toBe(2);
});

test("invalid usernames are refused without adding or changing accounts", async () => {
  const auth = new PasswordAuthenticatingConcept(database.db);
  const credentials = { username: "existing_user", password: "test-password" };
  const existing = await auth.register(credentials);
  const users = database.db.collection("auth.users");
  const before = await users.find({}).toArray();

  for (const username of ["", "ab", "a".repeat(25), "two words", "name!", "中文名"]) {
    await expect(auth.register({ username, password: "test-password" })).rejects.toBeInstanceOf(InvalidUsername);
    expect(await users.find({}).toArray()).toEqual(before);
  }
  expect(await auth.authenticate(credentials)).toEqual(existing);
});

test("passwords outside the allowed lengths are refused without adding or changing accounts", async () => {
  const auth = new PasswordAuthenticatingConcept(database.db);
  const credentials = { username: "existing_user", password: "test-password" };
  const existing = await auth.register(credentials);
  const users = database.db.collection("auth.users");
  const before = await users.find({}).toArray();

  for (const password of ["", "p".repeat(7), "p".repeat(129)]) {
    await expect(auth.register({ username: "new_user", password })).rejects.toBeInstanceOf(InvalidPassword);
    expect(await users.find({}).toArray()).toEqual(before);
  }
  expect(await auth.authenticate(credentials)).toEqual(existing);
});

test("missing accounts and wrong passwords return the same refusal without changing stored accounts", async () => {
  const auth = new PasswordAuthenticatingConcept(database.db);
  const credentials = { username: "existing_user", password: "test-password" };
  const existing = await auth.register(credentials);
  const users = database.db.collection("auth.users");
  const before = await users.find({}).toArray();

  for (const input of [
    { ...credentials, password: "wrong-password" },
    { username: "missing_user", password: credentials.password },
  ]) {
    await expect(auth.authenticate(input)).rejects.toBeInstanceOf(InvalidCredentials);
    expect(await users.find({}).toArray()).toEqual(before);
  }
  expect(await auth.authenticate(credentials)).toEqual(existing);
});
