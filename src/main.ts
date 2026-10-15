import { client, db } from "./db.ts";
import { createCatchupHandler } from "./server.ts";

await db.command({ ping: 1 });
const app = createCatchupHandler(db);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/api/*": app.handle,
    "/health": () => Response.json({ status: "ok" }),
  },
});
console.log(`Catchup backend ready at ${server.url}`);
const expiryTimer = setInterval(() => {
  app.expireWindows().catch(() => console.error("Receiving-window cleanup could not reach MongoDB."));
}, 5000);
async function shutdown() {
  clearInterval(expiryTimer);
  server.stop();
  await app.close();
  await client.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
