import { assembleApplication } from "./src/assembly.ts";
import { httpWire } from "@mit-sdg/sync-engine-http/tooling";
import { policy } from "./src/http.ts";

export default {
  assemble: assembleApplication,
  title: "Catchup",
  wireName: "CatchupWire",
  design: { version: 1, documents: [
    new URL("./design/types.md", import.meta.url),
    new URL("./design/compositions/Catchup.md", import.meta.url),
  ] },
  projections: [httpWire({ policy, name: "CatchupWireHttp" })],
};
