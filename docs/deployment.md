# Deploying Catchup

App: [catch-up.mit-sdg.dev](https://catch-up.mit-sdg.dev/). The app was successfully deployed during P3; new local commits still need to be deployed and verified separately. Use the course's [deployment guide](https://61040.github.io/fa26/resources/deploying-apps/) with these repository settings.

## Class-platform settings

| Setting | Value |
| --- | --- |
| Repository | `https://github.com/niheyang/61040project` |
| Branch | `main`, containing the reviewed commit |
| Runtime | Bun; `package.json` pins `bun@1.4.2` |
| Package directories | `.` |
| Build script | `build` |
| Start script | `start` |
| Port | `3000` |
| Health check path | `/health` |
| Database variable | `MONGODB_URL`, containing the provisioned MongoDB URI |

The scripts are names from the root `package.json`. `build` creates `web/dist`; `start` runs the Bun backend, which serves that directory and `/api/...` requests together. Production does not run Podman or Vite. The backend respects the platform's `HOST` and `PORT`, and `client.db()` uses the database assigned in the URI. Never commit `.env` or credentials. Local demonstration data does not transfer automatically to the deployed database.

Current authentication sends credentials in each protected request and keeps them in tab memory. Reloading requires sign-in again. This implementation uses no cookie session and does not require `PUBLIC_ORIGIN`.

## Upgrade an existing database once

This version replaces the separate `holding_entries` and `receptivity_windows` collections with `receiving_recipients`. The upgrade preserves pending/released states and window handles, without changing accounts, messages, drawings, or bookmarks.

1. **Stop every backend using the old schema and prevent user traffic during the upgrade.** Locally, stop old development/production servers with Control-C. For deployment, stop the old app or pause its traffic before starting the replacement. Avoid a rolling deployment that leaves old and new writers running together.
2. **Back up the database** with the host's backup facility or `mongodump`, and keep a restorable copy. Confirm the new process points to the intended database through `MONGODB_URL`.
3. **Run the upgrade.** Starting `bun run start` automatically calls [`migrateReceiving`](../src/migrations/receiving.ts) before opening the HTTP server. Alternatively, run `bun run db:migrate` with the same database configuration, then start the app. A new empty database is prepared by the same step.
4. **Verify before resuming traffic.** Check `/health`, sign in with existing accounts, and confirm old released history, pending messages, bookmarks, and window behavior. If migration fails, correct the reported problem before admitting traffic.

The migration validates the legacy records, inserts recipient documents without overwriting existing upgraded documents, and records completion in `schema_migrations` as `receiving-v1`. A completed upgrade is skipped on later starts. The original legacy collections are retained and are no longer used by the new application. They are a historical snapshot, not a continuously updated backup. Do not restart the old backend against this database after new writes begin; it would use different availability state.

## Build and verify

For a local production preview, stop any server already using port 3000, then run:

```sh
bun run db:up
bun run build
NODE_ENV=production bun run start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) and `/health`. For the class deployment, push the reviewed commit, confirm the settings and database variable in the [existing app settings](https://mit-sdg.dev/apps/2441dda4-5886-4c2c-b735-17034528d545/configuration), and deploy that exact commit. Pushing alone does not deploy it. Follow the upgrade procedure above when replacing an older version.

Through the live interface, verify registration/sign-in, sending while closed, explicit catch-up, receiving during the window, ending reception, drawing messages, bookmarks, and reload/persistence. Confirm that frontend requests use relative `/api/...` URLs and both themes load. Record the deployed commit and any unresolved issues in the submission materials.

Local recordings, temporary `.build/` folders, and `node_modules` are ignored. Keep source, specifications, required design materials, and saved validation evidence tracked. Link the hosted recording rather than committing it, and keep the selected commit within the platform's 50 MB limit.
