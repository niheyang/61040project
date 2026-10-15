import { randomUUID } from "node:crypto";
import { MongoClient, type Db } from "mongodb";

export interface TestDb {
  db: Db;
  close(): Promise<void>;
}

// Every suite gets its own database; cleanup never touches the application DB.
export async function openTestDb(): Promise<TestDb> {
  const url = process.env.TEST_MONGODB_URL ?? process.env.MONGODB_URL
    ?? "mongodb://dev:dev@127.0.0.1:27018/catchup?authSource=admin";
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5_000 });
  try {
    await client.connect();
    const db = client.db(`catchup-test-${randomUUID()}`);
    await db.command({ ping: 1 });
    return {
      db,
      async close() {
        try {
          await db.dropDatabase();
        } finally {
          await client.close();
        }
      },
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}
