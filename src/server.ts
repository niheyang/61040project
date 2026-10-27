import { createGateway } from "@mit-sdg/sync-engine/boundary";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import type { Db } from "mongodb";
import { assembleApplication } from "./assembly.ts";
import { policy } from "./http.ts";

export function createCatchupHandler(database: Db, clock: () => number = Date.now) {
  const application = assembleApplication(database, clock);
  const gateway = createGateway({ application });
  const handler = createHttpHandler({ application, gateway, policy });
  // Serialize complete local request flows, including reactions, so a close
  // cannot interleave with an authorization check and its release.
  let queue: Promise<unknown> = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  }
  return {
    application,
    handle(request: Request) {
      return serialize(async () => {
        const response = await handler(request);
        await application.whenIdle();
        // API responses can contain private messages, drawings, and identities.
        response.headers.set("Cache-Control", "no-store");
        return response;
      });
    },
    expireWindows() {
      return serialize(async () => {
        const expired = await application.concepts.Receptivity._expired({});
        for (const { window } of expired) {
          await application.concepts.Receptivity.expire({ window });
        }
        await application.whenIdle();
      });
    },
    async close() { await queue; await application.beginDrain(); },
  };
}
