# Catchup

Catchup lets friends share non-urgent text and drawings when they think of them.
Recipients choose when new shares become available by opening a fifteen-minute
catch-up window. Previously released conversations remain accessible after the
window closes. Release means availability, not reading or replying.

## Organization

The executable composition is assembled in `src/compositions/Catchup.ts` from
small modules: `authentication.ts`, `messages.ts`, `reception.ts`, `bookmarks.ts`,
`dashboard.ts`, and `views.ts`. The HTTP server receives requests and returns
responses; it does not order requests to enforce receiving behavior.

## Accounts and identity

[Register](reaction:Catchup.Register) creates an account and returns its identity
and canonical username. [Login](reaction:Catchup.Login) checks credentials and
returns the same identity. Neither action starts reception.

[CheckUsername](reaction:Catchup.CheckUsername) authenticates the requester before
checking an exact username. It trims whitespace, ignores case, and returns only
`{exists: true}` or `{exists: false}`. It does not reveal another user's messages
or receiving window. Input validators reject malformed values and unknown fields.

```endpoints
Catchup.Register at /catchup/register
Catchup.Login at /catchup/login
Catchup.CheckUsername at /catchup/checkUsername
```

## Sending and receiving

[Send](reaction:Catchup.Send) and [SendDrawing](reaction:Catchup.SendDrawing)
authenticate the sender, resolve the recipient's username, and create a message
through Messaging. [SendMissingRecipient](reaction:Catchup.SendMissingRecipient)
and [SendDrawingMissingRecipient](reaction:Catchup.SendDrawingMissingRecipient)
return a refusal for an unknown recipient on those same paths. Clients cannot
choose a sender identity or supply additional actor fields.

[HoldShare](reaction:Catchup.HoldShare) and [HoldDrawing](reaction:Catchup.HoldDrawing)
pass each newly created message's opaque handle to Receiving.enqueue. Receiving
owns both the window and pending/released entries, so enqueue itself decides
whether the new handle waits or is released. Message content stays in Messaging.
The send response waits for its flow to settle and checks that the receiving entry
exists. Content creation and enrollment are separate actions; a failed enrollment
does not yield a successful send response and does not roll back message creation.

[StartCatchup](reaction:Catchup.StartCatchup) calls Receiving.open for the
authenticated user. That owner action atomically opens a fresh window and releases
all entries already pending for that recipient. [EndCatchup](reaction:Catchup.EndCatchup)
calls Receiving.close with the actor and exact window handle. Released entries
remain released. A replaced or another person's window cannot be closed by an old
handle. The host clock sweep asks Receiving.expire to clear elapsed windows; the
owner action also checks the deadline, so an early sweep cannot close an active one.

Receiving's MongoDB update is the decision point for concurrent enqueue, open,
close, and expiry operations. If enqueue wins while the window is open, its entry
is released; if close wins first, the new entry waits. This ordering comes from
the state-owning action's atomic write, not the arrival order of HTTP requests.
Production updates use the database clock; tests can inject a deterministic clock.
No composition query reads readiness and later asks a different concept to release.

```endpoints
Catchup.Send at /catchup/send
Catchup.SendMissingRecipient at /catchup/send
Catchup.SendDrawing at /catchup/sendDrawing
Catchup.SendDrawingMissingRecipient at /catchup/sendDrawing
Catchup.StartCatchup at /catchup/startCatchup
Catchup.EndCatchup at /catchup/endCatchup
```

## Authorized views and private bookmarks

[ReleasedIncoming](view:Catchup.ReleasedIncoming) selects only messages addressed
to the actor whose Receiving status is RELEASED. [AccessibleMessage](view:Catchup.AccessibleMessage)
applies the same recipient-and-release checks to a particular handle. Guessing an
ID cannot expose pending content or another person's received messages.

[Incoming](former:Catchup.Incoming) adds public usernames and original creation
times to released incoming records. [Sent](former:Catchup.Sent) returns the actor's
own outgoing records and their delivery statuses. [Windows](former:Catchup.Windows)
returns only the actor's active window. [Dashboard](reaction:Catchup.Dashboard)
combines these with [Saved](former:Catchup.Saved), which intersects the actor's
private bookmarks with accessible incoming messages. It exposes no pending count,
preview, or readiness information about friends. Raw concept operations stay internal.

[Save](reaction:Catchup.Save) checks AccessibleMessage before bookmarking.
[RemoveSaved](reaction:Catchup.RemoveSaved) removes only the actor's saved pair.
[ViewMessage](reaction:Catchup.ViewMessage) returns the guarded
[MessageDetails](former:Catchup.MessageDetails) record. Bookmarks do not modify
content, remove messages from history, or act as read receipts.

```endpoints
Catchup.Dashboard at /catchup/dashboard
Catchup.Save at /catchup/save
Catchup.RemoveSaved at /catchup/removeSaved
Catchup.ViewMessage at /catchup/viewMessage
```

## Optional update check

[CheckUpdates](reaction:Catchup.CheckUpdates) authenticates the requester, then
queries Receiving._hasPending using the authenticated identity. It returns only
`{waiting: true}` or `{waiting: false}`. There are no counts, handles, sender names,
or content previews. It changes no state, opens no window, and releases nothing.
The normal dashboard remains unchanged. The frontend makes this request only on
an explicit click while reception is closed, and clears the answer after eight
seconds, on sign-out, or when the receiving window changes.

```endpoints
Catchup.CheckUpdates at /catchup/checkUpdates
```

## Authentication and transport

Every protected request authenticates its username and password. The acting
identity comes from authentication, not a client-supplied owner ID. Vue keeps
credentials only in memory and clears them on sign-out; reloading requires sign-in.
Passwords and password hashes never enter formed responses. User-facing HTTP
failures use categories rather than internal diagnostics.

API responses use `Cache-Control: no-store`. Sign-out remains available during
requests, clears the tab immediately, and invalidates old responses. It does not
undo an action already accepted by the server. Input validators and authorization
views apply equally to text and drawing messages.
