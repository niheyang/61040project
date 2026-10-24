# First deployment of Catchup

Target app: [catch-up.mit-sdg.dev](https://catch-up.mit-sdg.dev/). The first deployment of commit `8ac2fca` failed before building because a temporary `docs/visual-design/.build/node_modules` link pointed outside the repository. The cleanup removes that generated folder and local recordings from Git tracking while retaining local copies. A successful live deployment has not yet been verified.

Follow the course's [deployment guide](https://61040.github.io/fa26/resources/deploying-apps/). The settings below are specific to this repository, whose Vue source lives in `web/` but whose dependencies and lockfile all live at the repository root.

## Review the production build locally

```sh
bun run db:up
bun run check:design
bun run check
bun test
bun run build
NODE_ENV=production bun run start
```

Use `bun run dev` for normal local development. The production `start` command must run the Bun backend and serve the files built in `web/dist`; it must not run Podman or Vite's development server. If port 3000 is already in use, stop the older backend or run `PORT=3100 bun run start` and open that port.

Check `/health`, then open the same server's `/` page. Register demonstration accounts, send a share, open a catch-up window, reload, and sign in again to confirm persistence. The frontend must send requests to relative `/api/...` URLs. A successful local run does not establish a successful live deployment.

## Class-platform settings

| Setting | Value |
| --- | --- |
| Repository | `https://github.com/niheyang/61040project` |
| Branch | `main`, if that is the branch containing the reviewed commit |
| Runtime | Bun |
| Package directories | `.` only; `web/` has no separate package manifest or lockfile |
| Build script | `build` |
| Start script | `start` |
| Port | `3000` |
| Health check | `/health` |
| Database | Add MongoDB and map its supplied URI to `MONGODB_URL` |

The platform provides `HOST`, `PORT`, and `NODE_ENV`. The backend must respect `HOST` and `PORT`. Keep `client.db()` without an explicit database name so the connection string selects the assigned database. Do not upload or paste the local `.env` into Git. The deployed database starts empty; local demonstration data does not move automatically.

This version uses username/password authentication on each protected request, with credentials held only in tab memory; reloading requires signing in again. It does not use cookie sessions or read `PUBLIC_ORIGIN`, so that variable is not required by the current implementation. The sync-engine HTTP library's origin check applies to cookie-bound routes; it does not restrict these credential-in-body requests. If authentication later uses cookies, configure the deployed origin as described in the course guide.

Local recordings (`*.mov`, `*.mp4`, `*.webm`), temporary `.build/` folders, and `node_modules` directories or links are ignored. Upload recordings to the video host used for submission and put the shared link in the README; `.gitignore` keeps `git add .` from collecting these generated/local files again. Source, specifications, saved validation output, required screenshots, and the visual-design slides remain tracked.

## Retry deployment and verify

1. Keep the existing `catch-up` app. A new app is not needed for this repair.
2. Sign in at [the existing app's settings](https://mit-sdg.dev/apps/2441dda4-5886-4c2c-b735-17034528d545/configuration) and confirm the settings above.
3. Add MongoDB if it has not been provisioned, and wait for setup to finish. Confirm the connection variable is named `MONGODB_URL`.
4. Commit and push the reviewed project. Keep all source files in the selected commit together under the platform's 50 MB limit. Link the video instead of committing it.
5. Pick that exact commit and deploy it. Pushing a commit alone does not deploy it.
6. Open the public URL and `/health`. Repeat registration, sign-in, sending while closed, explicit catch-up, ending the window, and reload/persistence through the live interface. Check that both themes and the mobile layout load.
7. Record the live URL and full GitHub commit link in the README and submission. Record unresolved issues in the individual design notebook.

## Submission still requires

- The public project repository and its submitted commit hash.
- The individual repository containing the updated notebook and its submitted commit hash.
- The live app URL, running the submitted project commit.
- The narrated video link, at most two minutes long.

Submit those links and hashes through Commons after verifying them. The notebook, a locally built frontend, and a recording script do not substitute for the live app or video.
