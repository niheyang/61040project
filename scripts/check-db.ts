import { client, db } from "../src/db.ts";

const deadline = Date.now() + (process.argv.includes("--wait") ? 30_000 : 0);
try {
  while (true) {
    try {
      await db.command({ ping: 1 });
      console.log(`Connected to ${db.databaseName}. MongoDB is ready.`);
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await Bun.sleep(500);
    }
  }
} finally {
  await client.close();
}
