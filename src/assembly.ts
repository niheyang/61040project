import { assemble } from "@mit-sdg/sync-engine/assembly";
import { applicationConceptSet } from "./concepts.ts";
import type { Db } from "mongodb";
import { PasswordAuthenticatingConcept } from "./concepts/PasswordAuthenticating.ts";
import { Messaging } from "./concepts/Messaging.ts";
import { Receiving } from "./concepts/Receiving.ts";
import { Bookmarking } from "./concepts/Bookmarking.ts";
import { composition } from "./compositions/Catchup.ts";
import { db } from "./db.ts";

export function assembleApplication(database: Db = db, clock: () => number = Date.now) {
  return assemble({
    conceptSet: applicationConceptSet,
    instances: {
      PasswordAuthenticating: new PasswordAuthenticatingConcept(database),
      Messaging: new Messaging(database),
      Receiving: new Receiving(database, clock === Date.now ? undefined : clock),
      Bookmarking: new Bookmarking(database),
    },
    composition: { Catchup: composition },
    queryCache: "none",
    retention: { window: 0 },
  });
}
