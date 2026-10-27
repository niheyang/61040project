# Implementation guide

This guide explains the current conversation workflow and how Vue, Bun, sync-engine, and MongoDB fit together. For setup commands and project materials, see the [main README](../README.md).

## Try the core journey

Use two browser tabs or windows and create two accounts, such as Alice and Bob. Usernames use 3–24 letters, numbers, or underscores and ignore case. Passwords use 8–128 characters. Exchange usernames to send shares.

1. **Alice starts a chat.** Enter Bob's exact username in **Find or start a chat** and select the plus button or press Enter. Send a short message or link using **Text**, or select **Draw** to send a handwritten note. Alice's outgoing message shows **Waiting for catch-up** while Bob's reception is closed.
2. **Bob signs in.** Held messages reveal no conversation row, preview, badge, or waiting count. Signing in or opening an existing chat does not open reception.
3. **Bob selects Catch up now.** A 15-minute window opens across all friends. Alice's message appears in their conversation with its original creation time.
4. **Alice sends another share.** During Bob's open window, it becomes **Available** and appears automatically. Available describes access; it is not a read receipt.
5. **Bob replies in Alice's chat.** Both directions appear together in chronological order. His reply waits for Alice's own catch-up window. He can select **Save** on a received message and use **Saved only** to find his private bookmarks within that chat.
6. **Bob ends catch-up.** Released messages and bookmarks remain accessible. Another new share from Alice waits until Bob opens a later window.
7. **Bob removes a bookmark.** Select **Saved** on the bookmarked bubble. It disappears from the saved filter while its original message remains in the conversation.

You must sign in again after reloading because the Vue app keeps credentials only in memory. Accounts and content remain in MongoDB. An existing receiving window also persists: signing out or closing a tab does not end it. Use **End catch-up** or let its server-side deadline pass.

### Check for updates without receiving messages

While reception is closed, **Check for updates** reports either **New messages are waiting.** or **Nothing new yet.** The answer disappears after eight seconds. It is a snapshot requested by that click and is not refreshed by dashboard polling. Opening a window, signing out, or leaving the app clears the answer and ignores any late response.

[`CatchupTimer.vue`](../web/src/CatchupTimer.vue) emits the button event, and [`App.vue`](../web/src/App.vue) calls the authenticated `/api/catchup/checkUpdates` endpoint. The endpoint obtains the acting identity from authentication and calls [`Holding._hasPending`](../src/concepts/Holding.ts), which checks for one pending entry in MongoDB and returns only a boolean. It performs no writes and never opens a window or releases a message. Message counts, identities, sender names, and content remain hidden.

## Supported features

This MVP demonstrates three product behaviors: capture a share, choose when to receive it, and keep a received message for later. The P3 interface groups the exchange into one conversation per friend, with incoming and outgoing bubbles, a targeted composer, conversation search, and a private saved-message filter.

Start a conversation by an existing friend's username. **Find or start a chat** filters existing conversations by username or typed message content, ignoring case. Clicking a result opens that conversation at its matching message. Enter or the plus button opens or starts a chat with the exact username, after checking the account exists. An optional leading `@` is accepted. A username mentioned in another conversation does not redirect the Enter action to that content match. Missing accounts produce an error without creating an empty chat. Drawings have a **[Drawing]** preview; their handwriting is not searched or recognized.

Conversations containing messages are reconstructed from MongoDB history when you sign in. Empty new chats and per-friend text/drawing drafts stay in memory for the current tab and clear on sign-out or reload. Friends do not require a separate request or acceptance step. Messages refresh automatically while the tab is visible; the interface adds no read receipts, presence indicators, or held-message counts.

### Handwriting and doodles

The composer defaults to **Text**. Select **Draw** for a small freehand pad with navy, teal, and coral ink, **Undo**, **Clear**, and **Send drawing**. Switching modes or friends preserves completed draft strokes during the current signed-in session; a successful send clears only the drawing that was sent. The same catch-up release rules and private bookmarks apply to both message formats.

The editor uses [Signature Pad](https://github.com/szimek/signature_pad), an MIT-licensed library, with our Vue controls and message integration. Its [license notice](../web/public/third-party-notices.txt) is included with the app. Drawings are stored as bounded stroke coordinates in MongoDB, with no separate media upload service. The format has a 600×300 logical canvas, three allowed ink colors, and limits of 120 strokes, 3,000 points, and 96,000 serialized bytes. These bounds keep small notes suitable for the current full-history dashboard refresh. Larger media support would need a different loading strategy.

See the [handwriting implementation walkthrough](handwriting.md) for the data flow and file locations. [Automated drawing validation](validation/README.md) covers storage, refusals, release/privacy, bookmarks, serialization, and previews. Browser interaction, appearance, and live-deployment checks remain to be recorded separately.

## Architecture

### Step 1: Connect a persistent database

[`compose.yaml`](../compose.yaml) runs MongoDB locally, and [`src/db.ts`](../src/db.ts) reads the connection address from `.env`. [`scripts/check-db.ts`](../scripts/check-db.ts) sends a database ping. This confirms the app can store data before starting its web servers.

### Step 2: Give each concept its own state

The five independent concept implementations live in [`src/concepts/`](../src/concepts), with strict specifications in [`design/concepts/`](../design/concepts). Each receives a MongoDB database and owns separate collections. Concepts do not import or call one another.

| Concept | Responsibility |
| --- | --- |
| PasswordAuthenticating | Register accounts, store Argon2id password hashes, and return a stable authenticated user identity |
| Messaging | Preserve text or drawing content, sender, recipient, and original creation time |
| Holding | Keep opaque message handles pending or released; repeated enqueue/release is harmless |
| Receptivity | Manage explicit 15-minute receiving windows and safely replace or close them |
| Bookmarking | Keep a private, idempotent list of opaque message handles |

Unique database indexes prevent duplicate usernames, holding entries, and bookmarks. Receptivity checks the trusted server clock whenever readiness is queried; release stops at the deadline even if the cleanup timer runs late. Old close/expiry handles cannot end a replacement window.

### Step 3: Connect the concepts with reactions

[`src/compositions/Catchup.ts`](../src/compositions/Catchup.ts) expresses the application rules in the course's sync-engine DSL:

- A message creation triggers enqueueing in Holding.
- Opening reception triggers release of pending items.
- Enqueueing during an open window triggers release of that item.
- A received message is returned only when it belongs to the authenticated recipient and has been released.
- Saving requires the same ownership and release checks.

Every protected endpoint authenticates its credentials. The acting identity comes from authentication, and request validation rejects additional fields such as a spoofed sender. Dashboard responses include authorized incoming messages, the user's own sent records, their private saved list, and their own active window. They include no pending incoming count or previews.

[`src/server.ts`](../src/server.ts) serializes complete request flows in this local backend process and waits for reactions to finish. This prevents a close operation from slipping between a release's readiness check and its action. Multiple backend replicas would require shared coordination; the current MVP runs one backend process.

[`design/types.md`](../design/types.md) binds opaque concept types; [`design/compositions/Catchup.md`](../design/compositions/Catchup.md) explains the authored composition. [`src/assembly.ts`](../src/assembly.ts) assembles the concepts and composition. [`generated/wire.ts`](../generated/wire.ts) is generated from that assembly and describes the API's inputs and outputs. Regenerate it after changing the application contract with `bun run generate`.

### Step 4: Display the state with Vue

[`web/src/App.vue`](../web/src/App.vue) contains the Composition API interface. [`web/src/conversations.ts`](../web/src/conversations.ts) combines authorized incoming and outgoing records by friend, orders each thread chronologically, and derives its latest visible preview. [`web/src/ChatMessage.vue`](../web/src/ChatMessage.vue) renders message bubbles, and [`web/src/api.ts`](../web/src/api.ts) calls the typed generated API. Text and drawing messages use the generated backend contract; hidden incoming messages never reach the grouping or search code.

The P3 appearance update uses locally hosted [Nunito Sans](https://fontsource.org/fonts/nunito-sans), aqua surfaces, navy text, and yellow action buttons. The flatter chat layout uses 6-pixel button corners, fewer outlines, and 17-pixel message text. Received messages sit directly on the thread background; outgoing messages have a subtle fill and 8-pixel corners. Left/right alignment and distinct fills distinguish the two directions without repeating sender names above every message. The header's light/dark switch remembers the browser's choice and initially follows the device preference. Colors live in [`web/src/style.css`](../web/src/style.css); theme behavior lives in [`web/src/theme.ts`](../web/src/theme.ts). Sample-message layout previews from before the repeated sender labels were removed are available in [light mode](previews/p3-flat-light.jpg), [dark mode](previews/p3-flat-dark.jpg), and [mobile dark mode](previews/p3-flat-mobile-dark.jpg).

`ref()` stores changing values such as the selected friend, per-friend drafts, and dashboard response. `computed()` derives the countdown, conversations, and saved-message lookup from those values. Stable message IDs used as Vue `:key` values keep rendered bubbles associated with the correct message. The dashboard refreshes every three seconds while the tab is visible; refreshing never starts a receiving window. Enter sends a message; Shift+Enter inserts a new line. On narrow screens, **Back to chats** returns to the friend list without losing the current draft.

### Step 5: Check the behavior

From the project folder:

```sh
bun run db:up
bun run check:design
bun run check
bun test
bun run build
```

`check:design` checks the authored specification format. `check` checks concept source, application diagnostics, generated artifacts, and backend/Vue types. `bun test` checks behavior using isolated temporary MongoDB databases; it does not clear the application's database. `build` produces frontend files in `web/dist` for later deployment work.
