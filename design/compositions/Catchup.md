# Catchup

Catchup supports casual shares that friends value but can receive at different
times. Sending captures a share immediately. The recipient explicitly chooses
when pending incoming content becomes available; browsing released history does
not imply readiness for new content. This receiving boundary is the proposed
design response to postponed or overlooked sharing. Release means availability,
not reading, replying, or guaranteed attention. Its benefit compared with an
existing muted conversation remains a question for evaluation.

[Register](reaction:Catchup.Register) creates an account and returns only its
identity and canonical username. [Login](reaction:Catchup.Login) checks
credentials and returns the same identity. Neither starts reception.
Both validate JSON input before performing any action.

[CheckUsername](reaction:Catchup.CheckUsername) authenticates the requester before
checking an exact username through PasswordAuthenticating._byUsername. The query
trims whitespace and ignores case. Successful responses contain only
`{exists: true}` or `{exists: false}`. It returns no identity, messages, or receiving-window
information. Unknown input fields are rejected, and checking a username changes
no state or reception behavior.

```endpoints
Catchup.Register at /catchup/register
Catchup.Login at /catchup/login
Catchup.CheckUsername at /catchup/checkUsername
```

[Send](reaction:Catchup.Send) authenticates the acting sender and resolves the
recipient's username. A missing recipient is refused before message creation.
[SendMissingRecipient](reaction:Catchup.SendMissingRecipient) answers that case
on the same path; its absence guard is exclusive with Send's lookup guard.
[HoldShare](reaction:Catchup.HoldShare) enqueues each new text message.
The send response waits for that flow to settle and verifies the holding entry
exists, so successful capture means the message is held or already released.

[SendDrawing](reaction:Catchup.SendDrawing) uses the same authenticated sender and
exact recipient lookup for freehand drawings. [SendDrawingMissingRecipient](reaction:Catchup.SendDrawingMissingRecipient)
handles an unknown recipient on the same path. Its strict input validator accepts
only credentials, recipientUsername, and validated drawing data; additional actor
IDs, text, or unknown fields are rejected. Drawings use a bounded versioned stroke
format, not uploaded files or publicly readable media URLs. Messaging validates
the drawing again and stores a sanitized copy, while [HoldDrawing](reaction:Catchup.HoldDrawing)
enqueues its new message handle. Like text sending, a successful response waits
until the holding entry exists. The text endpoint retains its original strict
string-only request format.

[StartCatchup](reaction:Catchup.StartCatchup) opens a 15-minute window for the
authenticated user. [ReleasePending](reaction:Catchup.ReleasePending) authorizes
release of every pending item when that window is current and open. Each item
is transitioned idempotently; one dashboard update presents the resulting batch.
[ReleaseNewItem](reaction:Catchup.ReleaseNewItem) releases an arriving item only
when its recipient's window is open. [EndCatchup](reaction:Catchup.EndCatchup)
closes only the acting user's exact window handle. Previously released items
remain available. Signing in, reading, sending, and saving never open reception.

The local HTTP host serializes complete request flows, awaiting their reactions
before accepting the next operation. The receiving-window read is the release
authorization moment. This implements the P1 ordering rule in one server process;
multiple backend replicas would need a shared coordination mechanism.
A host clock sweep expires elapsed handles through Receptivity.expire and uses
the same queue. Deadline comparisons deny further releases even before cleanup.

[ReleasedIncoming](view:Catchup.ReleasedIncoming) selects incoming messages
addressed to the acting user with RELEASED holding status. The
[Incoming](former:Catchup.Incoming) former adds public usernames and original
creation times, including each message's drawing data or null for text.
[AccessibleMessage](view:Catchup.AccessibleMessage) applies the
same ownership and release guards to a particular handle; guessing a pending or
another person's message never bypasses them. Drawing data travels through these
same guarded views, so a pending drawing has no separately accessible media URL.

[Dashboard](reaction:Catchup.Dashboard) returns [Sent](former:Catchup.Sent) records
owned by the sender, with holding statuses, and the user's released incoming
records. [Windows](former:Catchup.Windows) exposes only their own active window.
It provides no pending incoming count, preview, or readiness information about
friends. Raw concept actions and queries are internal.

[Save](reaction:Catchup.Save) checks AccessibleMessage before bookmarking.
[RemoveSaved](reaction:Catchup.RemoveSaved) removes only the actor's saved pair.
[Saved](former:Catchup.Saved) intersects private bookmarks with accessible incoming
content. [ViewMessage](reaction:Catchup.ViewMessage) opens the original received
message using [MessageDetails](former:Catchup.MessageDetails). Bookmarks never
modify message content, remove it from history, or reveal a read receipt.

For this local MVP, every protected request reauthenticates username and password.
Vue keeps those credentials only in memory and clears them on sign-out. A reload
requires sign-in again. No client-supplied actor identity is accepted. User-facing
HTTP errors are categorized; password hashes never enter formed responses.

```endpoints
Catchup.Send at /catchup/send
Catchup.SendMissingRecipient at /catchup/send
Catchup.SendDrawing at /catchup/sendDrawing
Catchup.SendDrawingMissingRecipient at /catchup/sendDrawing
Catchup.Dashboard at /catchup/dashboard
Catchup.StartCatchup at /catchup/startCatchup
Catchup.EndCatchup at /catchup/endCatchup
Catchup.Save at /catchup/save
Catchup.RemoveSaved at /catchup/removeSaved
Catchup.ViewMessage at /catchup/viewMessage
```
