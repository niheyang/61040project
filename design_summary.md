# Catchup: P4 design summary

Catchup is a private space for existing friends to exchange non-urgent messages, links, and handwritten drawings. A sender records a share when it comes to mind. The recipient chooses when new messages enter their conversations by opening a 15-minute catch-up window. Released history remains browsable afterward. The goal is to make receiving intentional while preserving casual exchanges; the app does not guarantee attention, replies, or an advantage over an existing muted chat for every user.

## What remains from P1

The [submitted P1 design](https://github.com/niheyang/61040project/blob/f4755b54e2fdf317ad066e27f5ef641fadfb8a68/README.md) already specified an explicit 15-minute window, early closing, hidden pending messages, messages grouped by friend, sender availability status, and private bookmarks. The current implementation retains these decisions. The 15-minute window is therefore part of the P1 baseline, rather than a change introduced during P3 or P4.

Alice can send while Bob's window is closed and see **Waiting for catch-up** on her own message. Bob can sign in and browse old conversations without releasing it. **Catch up now** makes pending messages and arrivals during the window available across his chats. Closing or expiry stops further releases; it does not hide messages already received. **Available** describes access, not a read receipt. Bob's replies follow Alice's own receiving window.

The domain remains small exchanges between people who know one another and share usernames. There is no public feed, group chat, urgent override, or contact-approval system. Friends still need another channel for time-sensitive communication.

## Changes realized by P3

The [P3 implementation](https://github.com/niheyang/61040project/commit/8ac2fcaae579773ebabdb74087c20d538dc1d78e) presents exchanges as conversations, with incoming and outgoing messages together, a composer for the selected friend, search, and a private **Saved only** filter. Grouping by friend was already proposed in P1; P3 implements that organization as a chat interface. Search covers usernames and accessible typed message content. An exact-username action starts or opens a chat after checking that the account exists, avoiding confusion when a name also appears inside another conversation.

P1 limited messages to text and links. P3 adds optional handwriting and doodles using Signature Pad. Text remains the default, and drawings follow the same availability and bookmark rules. Bounded stroke data is stored with the message rather than at a public image URL. This supports small personal notes without adding a separate upload service. Whether recipients prefer handwriting or perceive it as more personal remains a question for user evaluation, not an established result.

The interface uses Nunito Sans, warm and aqua surfaces, navy text, yellow actions, and light/dark themes. Flatter bubbles, fewer outlines, and an alarm-clock timer aim for a casual appearance with less visual clutter. These are design choices; their usability effect is not demonstrated by automated tests.

## Refinements after P3

The [optional update check](https://github.com/niheyang/61040project/commit/871bfd81e1e34ea054a110eb07095a6981d5b0df) deliberately relaxes P1's complete concealment of pending-message presence. While reception is closed, a recipient can select **Check for updates** to get a boolean answer: something is waiting, or nothing is new. The answer disappears after eight seconds and does not update automatically. It reveals no count, sender, or preview and does not release messages. The tradeoff is that users can satisfy a little curiosity, while even this limited signal could prompt them to open reception sooner.

The current backend also revises the concept boundaries. Earlier versions had separate Holding and Receptivity concepts, with reactions checking readiness before releasing an item. The [P3 server](https://github.com/niheyang/61040project/blob/8ac2fcaae579773ebabdb74087c20d538dc1d78e/src/server.ts) serialized complete requests to protect that sequence. This left an important correctness rule in transport code and protected only one backend process.

Now [Receiving](design/concepts/Receiving.md) owns both the window and availability entries for each recipient. MongoDB updates them atomically: enqueue checks the current deadline while assigning status, and opening creates a window while releasing pending entries. Close and expiry require the relevant window handle, so an old event cannot close its replacement. The server no longer queues requests. Authentication, sending, reception, bookmarks, dashboard, and authorized views are split into small [composition modules](src/compositions/). A one-time [storage migration](docs/deployment.md#upgrade-an-existing-database-once) preserves existing availability and windows.

## Current limits and evidence

The four concepts are authentication, message storage, receiving, and bookmarking. Content creation and enrollment remain separate actions: a failed enrollment is not reported as a successful send, but it does not roll back stored content. A storage failure could therefore leave a sender's record without a corresponding receiving entry. Recipient availability uses one growing document subject to MongoDB's document-size limit, and dashboards load accessible histories; a larger service would need archiving or a different storage design, plus pagination.

[Saved validation evidence](docs/validation/README.md) documents automated checks and their limitations. Browser interactions, live deployment, and user preference require their own evidence. The [individual design notebook](https://github.com/niheyang/6.1040/blob/main/design_notes.md) contains the development account; this summary records the implemented design and verifiable changes without substituting for user findings or personal reflection.
