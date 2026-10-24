# P3 automated validation — October 23, 2026

These results describe the local working tree tested on October 23, 2026, using
Bun 1.4.2 and the existing local MongoDB service. All final commands exited with
code 0. Times and commands are recorded in the individual output files.

| Command | Result | Saved output |
| --- | --- | --- |
| Drawing tests only | 45 passed, 0 failed; 607 `expect()` calls | [drawing-tests.txt](drawing-tests.txt) |
| Complete `bun test` suite | 89 passed, 0 failed across 9 files; 1,229 `expect()` calls | [bun-test.txt](bun-test.txt) |
| `bun run check:design` | Passed for 7 specification files | [check-design.txt](check-design.txt) |
| `bun run check` | Concept, application, generated-contract, and TypeScript checks passed; 15 advisories | [check.txt](check.txt) |
| `bun run build` | Production frontend built successfully | [build.txt](build.txt) |

## What the new drawing tests establish

- [`drawing-domain.test.ts`](../../tests/drawing-domain.test.ts) calls Messaging
  actions and queries against MongoDB. It checks the drawing exchange principle,
  original timestamps, persistence through new concept instances, participant
  filtering, detached/immutable stored data, repeated sends, valid size boundaries,
  text compatibility, self-message refusal, and 21 malformed or excessive input
  classes. Refusals must leave the existing messages unchanged.
- [`drawing-http.test.ts`](../../tests/drawing-http.test.ts) exercises the actual
  application handler, authentication, reactions, views, and stored data. It checks
  pending privacy, release of held and arriving drawings, closing and exact
  expiry, private/idempotent bookmarks, fresh application instances, malformed and
  spoofed requests, and the request-body byte boundary. Rejected requests must
  leave messages, holding entries, bookmarks, and authorized dashboards unchanged.
- [`drawing.test.ts`](../../tests/drawing.test.ts) checks the shared drawing format,
  detached normalization, serialization at different display scales, replay
  timestamps, blank drawings, `[Drawing]` previews, and typed-text-only search.
  [`drawing-fixtures.ts`](../../tests/drawing-fixtures.ts) supplies fresh synthetic
  drawing data; it does not read the user's content.

Two consequential boundaries receive explicit regression checks: sending just
before versus exactly at a window's deadline, and both serialized orders of
sending a drawing and closing reception. A valid JSON drawing padded to exactly
128,000 request bytes is accepted; one extra byte is refused without mutation.
The latter would detect removal of the transport limit independently of drawing
validation. Serialization also prevents a zero replay timestamp from invoking
Signature Pad's fallback to the current time.

## Database isolation and reproduction

Every database-backed suite uses [`tests/test-db.ts`](../../tests/test-db.ts).
It creates a fresh `catchup-test-<UUID>` database and drops only that database on
cleanup. Setup creates messages/accounts through concept or application actions;
database reads may verify counts. The runs used the local MongoDB service at
127.0.0.1:27018. They did not clear the application's `catchup` database.

From the project folder, after installing dependencies and configuring MongoDB
as described in the main README:

```sh
bun run db:up
bun test tests/drawing.test.ts tests/drawing-domain.test.ts tests/drawing-http.test.ts
bun test
bun run check:design
bun run check
bun run build
```

The saved logs include the base Git commit and state that the source had
uncommitted changes. [source-manifest.sha256](source-manifest.sha256) identifies
58 source/configuration files for the final drawing and complete-suite runs;
it excludes credentials and personal notes. The base commit is not a claim that
these uncommitted changes were already in that commit. Rerun validation after
later implementation changes before using these results for a different version.

## Initial finding and correction

The first behavior runs passed, but the separate type check found a test assertion
passing a possibly undefined timestamp to a string comparison. The test already
asserted that the outgoing record existed; its subsequent timestamp access was
made explicit. No application behavior was changed for this correction. The
final drawing suite, complete suite, and type checks were rerun successfully.

The initial output is retained in [check-initial.txt](check-initial.txt),
[drawing-tests-initial.txt](drawing-tests-initial.txt), and
[bun-test-initial.txt](bun-test-initial.txt). These precede that test-only
correction; the final source manifest applies to the final runs.

## Limits of this evidence

No browser UI checks, pointer/touch drawing trials, user usability sessions, or
live deployment checks were performed in this run. The drawing serialization
tests do not establish visual rendering or layout correctness. The file named
`frontend.test.ts` checks production static-file serving, not a Vue browser journey.
Persistence checks create fresh concept/application instances using MongoDB; they
do not restart the MongoDB service itself. Manual journey and access-check notes
for the submitted interface and deployed version remain separate evidence.

The application check reports 15 advisories. The build also reports externalized
`node:util`/`node:crypto` dependencies from sync-engine. Both outputs are retained;
successful compilation is not a substitute for verifying the app in a browser.
