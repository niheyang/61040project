import { client, db } from "../src/db.ts";
import { migrateReceiving } from "../src/migrations/receiving.ts";

try {
  const result = await migrateReceiving(db);
  console.log(result.alreadyApplied
    ? "Receiving storage is already prepared."
    : `Receiving storage prepared: ${result.recipients} recipients, ${result.entries} entries, ${result.windows} windows. Legacy collections retained.`);
} finally {
  await client.close();
}
