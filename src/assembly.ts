import { assemble } from "@mit-sdg/sync-engine/assembly";
import { applicationConceptSet } from "./concepts.ts";
import type { Db } from "mongodb";
import { PasswordAuthenticatingConcept } from "./concepts/PasswordAuthenticating.ts";
import { Messaging } from "./concepts/Messaging.ts";
import { Holding } from "./concepts/Holding.ts";
import { Receptivity } from "./concepts/Receptivity.ts";
import { Bookmarking } from "./concepts/Bookmarking.ts";
import { composition } from "./compositions/Catchup.ts";
import { db } from "./db.ts";

export function assembleApplication(database: Db = db, clock: () => number = Date.now) {
  return assemble({
    conceptSet: applicationConceptSet,
    instances: {
      PasswordAuthenticating: new PasswordAuthenticatingConcept(database),
      Messaging: new Messaging(database), Holding: new Holding(database),
      Receptivity: new Receptivity(database, clock), Bookmarking: new Bookmarking(database),
    },
    composition: { Catchup: composition },
    queryCache: "none",
    retention: { window: 0 },
  });
}
