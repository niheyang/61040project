import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import type { Db } from "mongodb";
import { assembleApplication } from "./assembly.ts";
import { policy } from "./http.ts";

export function createCatchupHandler(database: Db, clock: () => number = Date.now) {
  const application = assembleApplication(database, clock);
  const gateway = createGateway({ application });
  const handler = createHttpHandler({ application, gateway, policy });
  return {
    application,
    async handle(request: Request) {
      const response = await handler(request);
      // API responses can contain private messages, drawings, and identities.
      response.headers.set("Cache-Control", "no-store");
      return response;
    },
    async expireWindows() {
      const expired = await application.concepts.Receiving._expired({});
      for (const { window } of expired) {
        await application.concepts.Receiving.expire({ window });
      }
    },
    async close() {
      await gateway.beginDrain();
      await application.beginDrain();
    },
  };
}
