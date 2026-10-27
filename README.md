# Catchup

Catchup lets friends exchange non-urgent text messages, links, and handwritten drawings. Recipients choose when new messages appear by opening a 15-minute catch-up window; previously released conversations remain accessible afterward.

[Live app](https://catch-up.mit-sdg.dev/) · [P4 narrated demo](https://youtu.be/12tqeZzXxic)

Built with **Vue**, **Bun**, **sync-engine**, and **MongoDB** for MIT 6.1040.

## Project materials

- [User journey](user_journey.md)
- [P4 design summary and changes since P1](design_summary.md)
- [Current concept specifications](design/concepts/), [types](design/types.md), and [application reactions](design/compositions/Catchup.md)
- [Automated validation and saved test output](docs/validation/README.md)
- [Visual design study](visual_design_study.pptx)
- [Design notebook](https://github.com/niheyang/6.1040/blob/main/design_notes.md) in the individual repository
- [Implementation guide](docs/implementation.md) and [handwriting walkthrough](docs/handwriting.md)
- [Earlier design and UI sketches](docs/design-history.md)
- [Deployment configuration](docs/deployment.md)

## Run locally

Install **Bun 1.4.2** and **Podman with a Compose provider**, following the [course MongoDB setup guide](https://61040.github.io/fa26/resources/mongodb-setup/). Start the Podman machine with `podman machine start` if it is stopped.

For a fresh checkout:

```sh
git clone https://github.com/niheyang/61040project.git
cd 61040project
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

When updating an existing checkout, keep your existing `.env`. The example configures the local MongoDB connection; `.env` is ignored by Git.

For an existing database, stop older backend processes before starting this version. Startup upgrades the receiving storage once; see [backup and upgrade instructions](docs/deployment.md#upgrade-an-existing-database-once).

Open **[http://127.0.0.1:8080](http://127.0.0.1:8080)**. The command starts MongoDB, the backend on port 3000, and the Vue development server on port 8080. MongoDB uses port 27018 and stores data in a persistent container volume.

Press **Control-C** to stop the development servers. `bun run db:down` stops MongoDB while keeping its data. Use `bun run db:check` or `bun run db:logs` to diagnose database startup problems.

## Try the app

Create two accounts in separate browser tabs and exchange usernames. Start a conversation through **Find or start a chat**, then send text or a drawing. The recipient selects **Catch up now** to release incoming messages and **End catch-up** to stop new arrivals. **Save** bookmarks a received message; **Saved only** filters the conversation.

While reception is closed, **Check for updates** briefly reports whether messages are waiting. It reveals no count, names, or content and leaves the catch-up window closed.

**Available** means the recipient can access a message, rather than that they have read it. Reloading requires signing in again; stored messages, bookmarks, and receiving windows persist. See the [full workflow](docs/implementation.md#try-the-core-journey).

## Checks and tests

With the local `.env` configured and Podman running:

```sh
bun run db:up
bun run check:design
bun run check
bun test
```

Tests create and remove isolated `catchup-test-<UUID>` databases without clearing the application's data. [Saved results and limitations](docs/validation/README.md) distinguish automated checks from browser and deployed-app validation.

## Production build

Stop the development servers before using port 3000 for a production preview:

```sh
bun run db:up
bun run build
NODE_ENV=production bun run start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000); `/health` reports server readiness. The backend serves the built Vue app from `web/dist`. For the class platform, use the [deployment settings](docs/deployment.md).

## Source and credits

Backend concepts and reactions live in [`src/`](src/), Vue components in [`web/src/`](web/src/), and tests in [`tests/`](tests/). After changing the application contract or linked specifications, run `bun run generate` to refresh [`generated/`](generated/).

Drawing uses [Signature Pad](https://github.com/szimek/signature_pad); typography uses Nunito Sans. Their [code license](web/public/third-party-notices.txt) and [font license](web/public/fonts/NunitoSans-OFL.txt) are included.
