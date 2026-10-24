# First deployment of Catchup

Status: local deployment preparation in progress. No class-platform app or live URL has been created for this project yet. A deployed beta can be updated while the design is refined.

Follow the course's [deployment guide](https://61040.github.io/fa26/resources/deploying-apps/). The settings below are specific to this repository, whose Vue source lives in `web/` but whose dependencies and lockfile all live at the repository root.

## Review the production build locally

```sh
bun run db:up
bun run check:design
bun run check
bun test
bun run build
bun run start
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

The API's allowed browser origin must match the deployed app. Set `PUBLIC_ORIGIN` to `https://<chosen-name>.mit-sdg.dev` with no trailing slash. For a production preview at a different local port, use that exact origin. This version uses username/password authentication on each protected request, with credentials held only in tab memory; reloading requires signing in again.

## Creation, deployment, and verification

1. Review the local result and choose a public app name. The name is permanent, and students have two app slots; reserve the other for the team project.
2. Sign in at [6.1040 Apps](https://mit-sdg.dev/) using the class account, create the app, and enter the settings above.
3. Add MongoDB and wait for setup to finish. Confirm the connection variable is named `MONGODB_URL`, then add `PUBLIC_ORIGIN`.
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
