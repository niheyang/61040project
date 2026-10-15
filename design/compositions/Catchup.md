# Catchup

[Register](reaction:Catchup.Register) creates an account and returns only its
identity and canonical username. [Login](reaction:Catchup.Login) checks
credentials and returns the same identity. Neither starts reception.
Both validate JSON input before performing any action.

```endpoints
Catchup.Register at /catchup/register
Catchup.Login at /catchup/login
```

[Send](reaction:Catchup.Send) authenticates the acting sender and resolves the
recipient's username. A missing recipient is refused before message creation.
[SendMissingRecipient](reaction:Catchup.SendMissingRecipient) answers that case
on the same path; its absence guard is exclusive with Send's lookup guard.
[HoldShare](reaction:Catchup.HoldShare) enqueues each new Messaging message.
The send response waits for that flow to settle and verifies the holding entry
exists, so successful capture means the message is held or already released.

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
creation times. [AccessibleMessage](view:Catchup.AccessibleMessage) applies the
same ownership and release guards to a particular handle; guessing a pending or
another person's message never bypasses them.

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
Catchup.Dashboard at /catchup/dashboard
Catchup.StartCatchup at /catchup/startCatchup
Catchup.EndCatchup at /catchup/endCatchup
Catchup.Save at /catchup/save
Catchup.RemoveSaved at /catchup/removeSaved
Catchup.ViewMessage at /catchup/viewMessage
```
