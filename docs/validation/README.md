# Automated validation

## P4 receiving ownership and organization — October 26, 2026

The complete local suite passed **121 tests with 1,742 assertions across 13 files**.
The focused receiving/HTTP run passed **33 tests with 992 assertions**, and the
migration run passed **14 tests with 96 assertions**. Saved
[complete-suite output](p4-receiving-2026-10-26/bun-test.txt),
[receiving/HTTP output](p4-receiving-2026-10-26/receiving-http-tests.txt),
[migration output](p4-receiving-2026-10-26/migration-tests.txt), and a
[source manifest](p4-receiving-2026-10-26/source-manifest.sha256) identify this version.

- [`receiving.test.ts`](../../tests/receiving.test.ts) checks the combined receiving
  principle, permanent availability, exact expiry, recipient separation, repeated
  items, replacement windows, and literal opaque identities. Separate raw concept
  instances share MongoDB without relying on the engine's action queues. Tests
  pause actual storage writes to force close-before-enqueue and
  enqueue-before-open interleavings; concurrent first inserts and openings are
  also exercised. Production database-clock expiry is checked separately from
  injected deterministic clocks.
- [`migration.test.ts`](../../tests/migration.test.ts) inserts retired-schema
  fixtures into disposable databases. It verifies preservation of window handles,
  dates, pending/released states, legacy collections, and unrelated accounts,
  messages, and bookmarks. Repeated/concurrent imports cannot overwrite upgraded
  recipients; invalid snapshots are rejected before target writes. These tests
  do not migrate the development or deployed database.
- HTTP text/drawing journeys, update checks, and the authentication/access matrix
  pass against the new Receiving storage and split composition. An unfinished
  request body no longer blocks an unrelated request. Overlapping sends and
  closes are checked against the permitted atomic storage orders, while a send
  after an awaited close must remain hidden.

[Design checks](p4-receiving-2026-10-26/check-design.txt),
[application/generated-contract/type checks](p4-receiving-2026-10-26/check.txt),
and the [production build](p4-receiving-2026-10-26/build.txt) passed. The application
checker retains 16 advisories: 12 conservative endpoint-fallback warnings and four
source-order notices for formed views. The build retains the sync-engine
`node:util`/`node:crypto` externalization warnings. These are saved rather than
treated as proof that browser or deployed behavior has been tested.

This run used isolated local MongoDB databases and left application data alone.
No browser or live-deployment checks were performed. Before upgrading a populated
database, follow the [stopped-writer migration procedure](../deployment.md#upgrade-an-existing-database-once).
Earlier sections below describe their own historical source manifests.

## P4 opt-in update check — October 26, 2026

The complete local suite passed **100 tests with 1,605 assertions across 11 files**.
The focused update-check/access-control run passed **8 tests with 363 assertions**.
Saved [focused output](p4-updates-2026-10-26/check-updates-tests.txt),
[complete-suite output](p4-updates-2026-10-26/bun-test.txt),
[build output](p4-updates-2026-10-26/build.txt), and a
[source manifest](p4-updates-2026-10-26/source-manifest.sha256) identify this run.

[`check-updates.test.ts`](../../tests/check-updates.test.ts) checks empty, pending,
released, closed, and exactly expired windows, with text and drawings from multiple
friends. Successful responses must equal `{waiting: true}` or `{waiting: false}`;
counts, identities, sender names, and previews are excluded. Repeated checks leave
all five stored collections and each user's dashboard unchanged. Invalid credentials,
forged owners, and malformed inputs are refused without mutation. The common
access-control matrix now includes all ten protected endpoints.

`bun run check:design`, `bun run check`, and the production build passed. The
application check reports 16 advisories. The added endpoint has the same conservative
fallback advisory as the other authenticated endpoints: its query always returns
one boolean row, and tests cover both results and authentication/validation refusals.

The frontend requests this status only after a click while reception is closed.
It dismisses the answer after eight seconds and invalidates pending results on
sign-out, opening reception, window changes, and unmounting. These UI behaviors
received source/type/build checks; browser and deployed-app tests were not run.
Earlier authentication and P3 results below describe their earlier source manifests.

## P4 authentication and access review — October 26, 2026

The complete local suite passed **96 tests with 1,444 assertions across 10 files**.
The production build and `bun run check` also passed; the application check still
reports 15 advisories. Saved [test output](p4-auth-2026-10-26/bun-test.txt),
[build output](p4-auth-2026-10-26/build.txt), and a
[source manifest](p4-auth-2026-10-26/source-manifest.sha256) identify this run.

- All nine protected endpoints refuse missing credentials, incorrect passwords,
  nonexistent accounts, and forged actor fields without changing stored data.
- Text and drawing reads/bookmarks require the authenticated recipient and a
  released message. Another account cannot release a recipient's pending shares,
  close their window, remove their bookmarks, or change their dashboard identity
  by supplying fake cookie or authorization headers. Internal concept actions
  and views are not public HTTP endpoints.
- Registration tests cover valid length boundaries and invalid usernames/passwords,
  consistent authentication refusals, stored password hashes, and unchanged state
  after failures. Tests use concept/application actions and isolated temporary DBs.
- No authentication or ownership bypass was found in the reviewed routes. API
  responses now carry `Cache-Control: no-store` as privacy hardening; the review
  did not establish a cache-based disclosure in the previous POST-only API.
- Sign-out now stays available during requests. Authentication cleanup is guarded
  against an old session clearing a newer session's busy state. These frontend
  changes received source review, Vue type checks, and a production build, without
  browser interaction tests.

These are local handler/DB tests, not deployed-app checks. The app still checks
passwords on every protected request; sign-out clears the tab's private state
and discards late responses, but does not revoke the password or undo an action
already authorized by the server. Live validation and the slow-request sign-out
journey remain to be performed on the deployed version.

## P3 automated validation — October 23, 2026

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

### What the new drawing tests establish

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

### Database isolation and reproduction

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

### Initial finding and correction

The first behavior runs passed, but the separate type check found a test assertion
passing a possibly undefined timestamp to a string comparison. The test already
asserted that the outgoing record existed; its subsequent timestamp access was
made explicit. No application behavior was changed for this correction. The
final drawing suite, complete suite, and type checks were rerun successfully.

The initial output is retained in [check-initial.txt](check-initial.txt),
[drawing-tests-initial.txt](drawing-tests-initial.txt), and
[bun-test-initial.txt](bun-test-initial.txt). These precede that test-only
correction; the final source manifest applies to the final runs.

### Limits of this evidence

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
