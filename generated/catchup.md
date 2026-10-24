<!-- Generated from the Catchup assembly. Do not edit. -->
<!-- Manifest producer: @mit-sdg/sync-engine@1.1.0; concept specification: sync-engine.concept-specification@1; renderer: @mit-sdg/sync-engine@1.1.0. -->

# Catchup — assembled read-back

_Assembled by sync-engine from registered concepts and composition. Edit the concept_
_specifications and composition source, then regenerate this file._

## Concepts

### Bookmarking

Defined in [Bookmarking](../design/concepts/Bookmarking.md), line 1.

#### Actions

- `save(person: User, item: Item) : returns (person: User, item: Item)`
- `remove(person: User, item: Item) : returns (person: User, item: Item)`

#### Queries

- `_saved(person: User) : many (item: Item)`

#### Instances

- `Bookmarking` — instance of `Bookmarking` — [Catchup application types](../design/types.md), line 22.
  - `Item` is `Messaging.Message` — [Catchup application types](../design/types.md), line 24.
  - `User` is `PasswordAuthenticating.User` — [Catchup application types](../design/types.md), line 23.

### Holding

Defined in [Holding](../design/concepts/Holding.md), line 1.

#### Actions

- `enqueue(recipient: Recipient, item: Item) : returns (recipient: Recipient, item: Item)`
- `release(recipient: Recipient, items: ItemBatch) : returns (released: ItemBatch)`

#### Queries

- `_pending(recipient: Recipient) : many (item: Item)`
- `_released(recipient: Recipient) : many (item: Item)`
- `_status(recipient: Recipient, item: Item) : one (status: Status)`

#### Instances

- `Holding` — instance of `Holding` — [Catchup application types](../design/types.md), line 17.
  - `Item` is `Messaging.Message` — [Catchup application types](../design/types.md), line 19.
  - `Recipient` is `PasswordAuthenticating.User` — [Catchup application types](../design/types.md), line 18.

### Messaging

Defined in [Messaging](../design/concepts/Messaging.md), line 1.

#### Actions

- `send(sender: User, recipient: User, text: String) : returns (message: Message)`
  - Refuses `MESSAGE_TO_SELF`: Choose another person as the recipient.
  - Refuses `INVALID_MESSAGE_TEXT`: Write a message of 1–2,000 characters.
- `sendDrawing(sender: User, recipient: User, drawing: Drawing) : returns (message: Message)`
  - Refuses `MESSAGE_TO_SELF`: Choose another person as the recipient.
  - Refuses `INVALID_DRAWING`: Draw something before sending, and keep the drawing within the size limit.

#### Queries

- `_get(message: Message) : optional (message: Message, sender: User, recipient: User, text: String, drawing: OptionalDrawing, createdAt: DateTime)`
- `_sent(user: User) : many (message: Message, sender: User, recipient: User, text: String, drawing: OptionalDrawing, createdAt: DateTime)`
- `_addressedTo(user: User) : many (message: Message, sender: User, recipient: User, text: String, drawing: OptionalDrawing, createdAt: DateTime)`

#### Instances

- `Messaging` — instance of `Messaging` — [Catchup application types](../design/types.md), line 15.
  - `User` is `PasswordAuthenticating.User` — [Catchup application types](../design/types.md), line 16.

### PasswordAuthenticating

Defined in [PasswordAuthenticating](../design/concepts/PasswordAuthenticating.md), line 1.

#### Actions

- `register(username: String, password: String) : returns (user: User, username: String)`
  - Refuses `INVALID_USERNAME`: Use 3 to 24 letters, digits, or underscores.
  - Refuses `INVALID_PASSWORD`: Use a password with 8 to 128 characters.
  - Refuses `USERNAME_TAKEN`: That username is already registered.
- `authenticate(username: String, password: String) : returns (user: User, username: String)`
  - Refuses `INVALID_CREDENTIALS`: The username or password is incorrect.

#### Queries

- `_byUsername(username: String) : optional (user: User)`
- `_name(user: User) : optional (username: String)`

#### Instances

- `PasswordAuthenticating` — instance of `PasswordAuthenticating` — [Catchup application types](../design/types.md), line 14.

### Receptivity

Defined in [Receptivity](../design/concepts/Receptivity.md), line 1.

#### Actions

- `open(person: User) : returns (window: Window, person: User, startedAt: DateTime, expiresAt: DateTime)`
- `close(person: User, window: Window) : returns (person: User, window: Window)`
- `expire(window: Window) : returns (window: Window)`

#### Queries

- `_current(person: User) : optional (window: Window, person: User, startedAt: DateTime, expiresAt: DateTime)`
- `_isOpen(person: User) : one (open: Flag)`
- `_active(person: User) : many (window: Window, person: User, startedAt: DateTime, expiresAt: DateTime)`
- `_expired() : many (window: Window)`

#### Instances

- `Receptivity` — instance of `Receptivity` — [Catchup application types](../design/types.md), line 20.
  - `User` is `PasswordAuthenticating.User` — [Catchup application types](../design/types.md), line 21.

## Computations

- `singleItem(item: Messaging.Message) : Holding.ItemBatch` — [Catchup application types](../design/types.md), line 9.

## Views

_Views name reusable conditions. Multiple `where` blocks are alternatives._

### a released incoming message of (person)

Authored path: `Catchup.ReleasedIncoming`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 64.

```view
a released incoming message of (person) — inputs (person); outputs (message, sender, text, drawing, createdAt); bindings () — answers any number of (message, sender, text, drawing, createdAt)
  where
    Messaging._addressedTo (user: person) has (createdAt, drawing, message, sender, text)
    Holding._status (item: message, recipient: person) has (status: "RELEASED")
```

### the released message (message) for (person)

Authored path: `Catchup.AccessibleMessage`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 68.

```view
the released message (message) for (person) — inputs (person, message); outputs (sender, text, drawing, createdAt); bindings () — answers at most one (sender, text, drawing, createdAt)
  where
    Messaging._get (message) has (createdAt, drawing, recipient: person, sender, text)
    Holding._status (item: message, recipient: person) has (status: "RELEASED")
```

## Formers

_Formers name result shapes evaluated when asked. The source former owns_
_the authored explanation; this section records the generated shape._

### the active window of (person)

Authored path: `Catchup.Windows`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 75.

```former
Former "the active window of (person)" — inputs (person); bindings (window, startedAt, expiresAt); promises exactly one record — forms:
  each Receptivity._active (person) has (expiresAt, startedAt, window)
    form a record of
      expiresAt
      person
      startedAt
      window
```

### the incoming messages of (person)

Authored path: `Catchup.Incoming`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 66.

```former
Former "the incoming messages of (person)" — inputs (person); bindings (message, sender, text, drawing, createdAt, senderUsername, recipientUsername); promises exactly one record — forms:
  each view "a released incoming message of (person)" with (person) has (createdAt, drawing, message, sender, text)
    where PasswordAuthenticating._name (user: sender) has (username: senderUsername)
    where PasswordAuthenticating._name (user: person) has (username: recipientUsername)
    form a record of
      createdAt
      drawing
      message
      recipient: person
      recipientUsername
      sender
      senderUsername
      text
```

### the received message (message) of (person)

Authored path: `Catchup.MessageDetails`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 83.

```former
Former "the received message (message) of (person)" — inputs (person, message); bindings (sender, text, drawing, createdAt, senderUsername, recipientUsername); promises at most one record — forms:
  a record of
    where view "the released message (message) for (person)" with (message, person) has (createdAt, drawing, sender, text)
    where PasswordAuthenticating._name (user: sender) has (username: senderUsername)
    where PasswordAuthenticating._name (user: person) has (username: recipientUsername)
    createdAt
    drawing
    message
    recipient: person
    recipientUsername
    sender
    senderUsername
    text
```

### the saved messages of (person)

Authored path: `Catchup.Saved`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 81.

```former
Former "the saved messages of (person)" — inputs (person); bindings (message, sender, text, drawing, createdAt, senderUsername, recipientUsername); promises exactly one record — forms:
  each Bookmarking._saved (person) has (item: message)
    where view "the released message (message) for (person)" with (message, person) has (createdAt, drawing, sender, text)
    where PasswordAuthenticating._name (user: sender) has (username: senderUsername)
    where PasswordAuthenticating._name (user: person) has (username: recipientUsername)
    form a record of
      createdAt
      drawing
      message
      recipient: person
      recipientUsername
      sender
      senderUsername
      text
```

### the sent messages of (person)

Authored path: `Catchup.Sent`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 73.

```former
Former "the sent messages of (person)" — inputs (person); bindings (message, recipient, text, drawing, createdAt, status, senderUsername, recipientUsername); promises exactly one record — forms:
  each Messaging._sent (user: person) has (createdAt, drawing, message, recipient, text)
    where Holding._status (item: message, recipient) has (status)
    where PasswordAuthenticating._name (user: person) has (username: senderUsername)
    where PasswordAuthenticating._name (user: recipient) has (username: recipientUsername)
    form a record of
      createdAt
      drawing
      message
      recipient
      recipientUsername
      sender: person
      senderUsername
      status
      text
```

## Reactions

### Catchup.CheckUsername

Authored path: `Catchup.CheckUsername`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 16.
- Covered by [Catchup](../design/compositions/Catchup.md), line 26.

```reaction
when RequestBoundary.request (password, path: "/catchup/checkUsername", recipientUsername, requestId, username)
then
  PasswordAuthenticating.authenticate (password, username)
```

### Catchup.CheckUsername:found#2

Authored path: `Catchup.CheckUsername`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 16.
- Covered by [Catchup](../design/compositions/Catchup.md), line 26.

```reaction
when PasswordAuthenticating.authenticate (password, username), asked by Catchup.CheckUsername
where
  earlier, RequestBoundary.request (password, path: "/catchup/checkUsername", recipientUsername, requestId, username)
  PasswordAuthenticating._byUsername (username: recipientUsername)
then
  RequestBoundary.respond (exists: true, requestId)
```

### Catchup.CheckUsername:missing#2

Authored path: `Catchup.CheckUsername`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 16.
- Covered by [Catchup](../design/compositions/Catchup.md), line 26.

```reaction
when PasswordAuthenticating.authenticate (password, username), asked by Catchup.CheckUsername
where
  earlier, RequestBoundary.request (password, path: "/catchup/checkUsername", recipientUsername, requestId, username)
  no PasswordAuthenticating._byUsername (username: recipientUsername)
then
  RequestBoundary.respond (exists: false, requestId)
```

### Catchup.Dashboard

Authored path: `Catchup.Dashboard`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 73.
- Covered by [Catchup](../design/compositions/Catchup.md), line 96.

```reaction
when RequestBoundary.request (password, path: "/catchup/dashboard", requestId, username)
then
  PasswordAuthenticating.authenticate (password, username)
```

### Catchup.Dashboard#2

Authored path: `Catchup.Dashboard`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 73.
- Covered by [Catchup](../design/compositions/Catchup.md), line 96.

```reaction
when PasswordAuthenticating.authenticate (password, username, user: person), asked by Catchup.Dashboard
where
  earlier, RequestBoundary.request (password, path: "/catchup/dashboard", requestId, username)
then
  RequestBoundary.respond (incoming: former "the incoming messages of (person)" with (person), requestId, saved: former "the saved messages of (person)" with (person), sent: former "the sent messages of (person)" with (person), windows: former "the active window of (person)" with (person))
```

### Catchup.EndCatchup

Authored path: `Catchup.EndCatchup`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 53.
- Covered by [Catchup](../design/compositions/Catchup.md), line 98.

```reaction
when RequestBoundary.request (password, path: "/catchup/endCatchup", requestId, username, window)
then
  PasswordAuthenticating.authenticate (password, username)
```

### Catchup.EndCatchup#2

Authored path: `Catchup.EndCatchup`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 53.
- Covered by [Catchup](../design/compositions/Catchup.md), line 98.

```reaction
when PasswordAuthenticating.authenticate (password, username, user: person), asked by Catchup.EndCatchup
where
  earlier, RequestBoundary.request (password, path: "/catchup/endCatchup", requestId, username, window)
then
  Receptivity.close (person, window)
```

### Catchup.EndCatchup#3

Authored path: `Catchup.EndCatchup`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 53.
- Covered by [Catchup](../design/compositions/Catchup.md), line 98.

```reaction
when Receptivity.close (person, window), asked by Catchup.EndCatchup#2
where
  earlier, RequestBoundary.request (password, path: "/catchup/endCatchup", requestId, username, window)
then
  RequestBoundary.respond (requestId, window)
```

### Catchup.HoldDrawing

Authored path: `Catchup.HoldDrawing`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 43.

```reaction
when Messaging.sendDrawing (drawing, recipient, sender, message)
then
  Holding.enqueue (item: message, recipient)
```

### Catchup.HoldShare

Authored path: `Catchup.HoldShare`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 33.

```reaction
when Messaging.send (recipient, sender, text, message)
then
  Holding.enqueue (item: message, recipient)
```

### Catchup.Login

Authored path: `Catchup.Login`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 12.
- Covered by [Catchup](../design/compositions/Catchup.md), line 25.

```reaction
when RequestBoundary.request (password, path: "/catchup/login", requestId, username)
then
  PasswordAuthenticating.authenticate (password, username)
```

### Catchup.Login#2

Authored path: `Catchup.Login`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 12.
- Covered by [Catchup](../design/compositions/Catchup.md), line 25.

```reaction
when PasswordAuthenticating.authenticate (password, username, user, result.username: canonicalUsername), asked by Catchup.Login
where
  earlier, RequestBoundary.request (password, path: "/catchup/login", requestId, username)
then
  RequestBoundary.respond (requestId, user, username: canonicalUsername)
```

### Catchup.Register

Authored path: `Catchup.Register`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 11.
- Covered by [Catchup](../design/compositions/Catchup.md), line 24.

```reaction
when RequestBoundary.request (password, path: "/catchup/register", requestId, username)
then
  PasswordAuthenticating.register (password, username)
```

### Catchup.Register#2

Authored path: `Catchup.Register`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 11.
- Covered by [Catchup](../design/compositions/Catchup.md), line 24.

```reaction
when PasswordAuthenticating.register (password, username, user, result.username: canonicalUsername), asked by Catchup.Register
where
  earlier, RequestBoundary.request (password, path: "/catchup/register", requestId, username)
then
  RequestBoundary.respond (requestId, user, username: canonicalUsername)
```

### Catchup.ReleaseNewItem

Authored path: `Catchup.ReleaseNewItem`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 52.

```reaction
when Holding.enqueue (item, recipient)
where
  Holding._status (item, recipient) has (status: "PENDING")
  Receptivity._isOpen (person: recipient) has (open: true)
  items is singleItem (item)
then
  Holding.release (items, recipient)
```

### Catchup.ReleasePending

Authored path: `Catchup.ReleasePending`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 49.

```reaction
when Receptivity.open (person, window)
where
  Receptivity._current (person) has (window)
  Receptivity._isOpen (person) has (open: true)
  Holding._pending (recipient: person) has (item)
  items is singleItem (item)
then
  Holding.release (items, recipient: person)
```

### Catchup.RemoveSaved

Authored path: `Catchup.RemoveSaved`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 80.
- Covered by [Catchup](../design/compositions/Catchup.md), line 100.

```reaction
when RequestBoundary.request (message, password, path: "/catchup/removeSaved", requestId, username)
then
  PasswordAuthenticating.authenticate (password, username)
```

### Catchup.RemoveSaved#2

Authored path: `Catchup.RemoveSaved`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 80.
- Covered by [Catchup](../design/compositions/Catchup.md), line 100.

```reaction
when PasswordAuthenticating.authenticate (password, username, user: person), asked by Catchup.RemoveSaved
where
  earlier, RequestBoundary.request (message, password, path: "/catchup/removeSaved", requestId, username)
then
  Bookmarking.remove (item: message, person)
```

### Catchup.RemoveSaved#3

Authored path: `Catchup.RemoveSaved`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 80.
- Covered by [Catchup](../design/compositions/Catchup.md), line 100.

```reaction
when Bookmarking.remove (item: message, person), asked by Catchup.RemoveSaved#2
where
  earlier, RequestBoundary.request (message, password, path: "/catchup/removeSaved", requestId, username)
then
  RequestBoundary.respond (message, requestId)
```

### Catchup.Save

Authored path: `Catchup.Save`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 79.
- Covered by [Catchup](../design/compositions/Catchup.md), line 99.

```reaction
when RequestBoundary.request (message, password, path: "/catchup/save", requestId, username)
then
  PasswordAuthenticating.authenticate (password, username)
```

### Catchup.Save:accessible#2

Authored path: `Catchup.Save`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 79.
- Covered by [Catchup](../design/compositions/Catchup.md), line 99.

```reaction
when PasswordAuthenticating.authenticate (password, username, user: person), asked by Catchup.Save
where
  earlier, RequestBoundary.request (message, password, path: "/catchup/save", requestId, username)
  view "the released message (message) for (person)" with (message, person)
then
  Bookmarking.save (item: message, person)
```

### Catchup.Save:accessible#3

Authored path: `Catchup.Save`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 79.
- Covered by [Catchup](../design/compositions/Catchup.md), line 99.

```reaction
when Bookmarking.save (item: message, person), asked by Catchup.Save:accessible#2
where
  earlier, RequestBoundary.request (message, password, path: "/catchup/save", requestId, username)
then
  RequestBoundary.respond (message, requestId)
```

### Catchup.Save:unavailable#2

Authored path: `Catchup.Save`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 79.
- Covered by [Catchup](../design/compositions/Catchup.md), line 99.

```reaction
when PasswordAuthenticating.authenticate (password, username, user: person), asked by Catchup.Save
where
  earlier, RequestBoundary.request (message, password, path: "/catchup/save", requestId, username)
  no view "the released message (message) for (person)" with (message, person)
then
  RequestBoundary.respond (error: "MESSAGE_UNAVAILABLE", requestId)
```

### Catchup.Send

Authored path: `Catchup.Send`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 29.
- Covered by [Catchup](../design/compositions/Catchup.md), line 92.

```reaction
when RequestBoundary.request (password, path: "/catchup/send", recipientUsername, requestId, text, username)
where
  PasswordAuthenticating._byUsername (username: recipientUsername)
then
  PasswordAuthenticating.authenticate (password, username)
```

### Catchup.Send#2

Authored path: `Catchup.Send`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 29.
- Covered by [Catchup](../design/compositions/Catchup.md), line 92.

```reaction
when PasswordAuthenticating.authenticate (password, username, user: sender), asked by Catchup.Send
where
  earlier, RequestBoundary.request (password, path: "/catchup/send", recipientUsername, requestId, text, username)
  PasswordAuthenticating._byUsername (username: recipientUsername) has (user: recipient)
then
  Messaging.send (recipient, sender, text)
```

### Catchup.Send#3

Authored path: `Catchup.Send`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 29.
- Covered by [Catchup](../design/compositions/Catchup.md), line 92.

```reaction
when Messaging.send (recipient, sender, text, message), asked by Catchup.Send#2
at the flow's settlement frontier
where
  Holding._status (item: message, recipient) and not (status: "ABSENT")
  earlier, RequestBoundary.request (password, path: "/catchup/send", recipientUsername, requestId, text, username)
then
  RequestBoundary.respond (message, requestId)
```

### Catchup.SendDrawing

Authored path: `Catchup.SendDrawing`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 37.
- Covered by [Catchup](../design/compositions/Catchup.md), line 94.

```reaction
when RequestBoundary.request (drawing, password, path: "/catchup/sendDrawing", recipientUsername, requestId, username)
where
  PasswordAuthenticating._byUsername (username: recipientUsername)
then
  PasswordAuthenticating.authenticate (password, username)
```

### Catchup.SendDrawing#2

Authored path: `Catchup.SendDrawing`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 37.
- Covered by [Catchup](../design/compositions/Catchup.md), line 94.

```reaction
when PasswordAuthenticating.authenticate (password, username, user: sender), asked by Catchup.SendDrawing
where
  earlier, RequestBoundary.request (drawing, password, path: "/catchup/sendDrawing", recipientUsername, requestId, username)
  PasswordAuthenticating._byUsername (username: recipientUsername) has (user: recipient)
then
  Messaging.sendDrawing (drawing, recipient, sender)
```

### Catchup.SendDrawing#3

Authored path: `Catchup.SendDrawing`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 37.
- Covered by [Catchup](../design/compositions/Catchup.md), line 94.

```reaction
when Messaging.sendDrawing (drawing, recipient, sender, message), asked by Catchup.SendDrawing#2
at the flow's settlement frontier
where
  Holding._status (item: message, recipient) and not (status: "ABSENT")
  earlier, RequestBoundary.request (drawing, password, path: "/catchup/sendDrawing", recipientUsername, requestId, username)
then
  RequestBoundary.respond (message, requestId)
```

### Catchup.SendDrawingMissingRecipient

Authored path: `Catchup.SendDrawingMissingRecipient`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 38.
- Covered by [Catchup](../design/compositions/Catchup.md), line 95.

```reaction
when RequestBoundary.request (drawing, password, path: "/catchup/sendDrawing", recipientUsername, requestId, username)
where
  no PasswordAuthenticating._byUsername (username: recipientUsername)
then
  PasswordAuthenticating.authenticate (password, username)
```

### Catchup.SendDrawingMissingRecipient#2

Authored path: `Catchup.SendDrawingMissingRecipient`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 38.
- Covered by [Catchup](../design/compositions/Catchup.md), line 95.

```reaction
when PasswordAuthenticating.authenticate (password, username, user: sender), asked by Catchup.SendDrawingMissingRecipient
where
  earlier, RequestBoundary.request (drawing, password, path: "/catchup/sendDrawing", recipientUsername, requestId, username)
then
  RequestBoundary.respond (error: "RECIPIENT_NOT_FOUND", requestId)
```

### Catchup.SendMissingRecipient

Authored path: `Catchup.SendMissingRecipient`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 31.
- Covered by [Catchup](../design/compositions/Catchup.md), line 93.

```reaction
when RequestBoundary.request (password, path: "/catchup/send", recipientUsername, requestId, text, username)
where
  no PasswordAuthenticating._byUsername (username: recipientUsername)
then
  PasswordAuthenticating.authenticate (password, username)
```

### Catchup.SendMissingRecipient#2

Authored path: `Catchup.SendMissingRecipient`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 31.
- Covered by [Catchup](../design/compositions/Catchup.md), line 93.

```reaction
when PasswordAuthenticating.authenticate (password, username, user: sender), asked by Catchup.SendMissingRecipient
where
  earlier, RequestBoundary.request (password, path: "/catchup/send", recipientUsername, requestId, text, username)
then
  RequestBoundary.respond (error: "RECIPIENT_NOT_FOUND", requestId)
```

### Catchup.StartCatchup

Authored path: `Catchup.StartCatchup`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 48.
- Covered by [Catchup](../design/compositions/Catchup.md), line 97.

```reaction
when RequestBoundary.request (password, path: "/catchup/startCatchup", requestId, username)
then
  PasswordAuthenticating.authenticate (password, username)
```

### Catchup.StartCatchup#2

Authored path: `Catchup.StartCatchup`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 48.
- Covered by [Catchup](../design/compositions/Catchup.md), line 97.

```reaction
when PasswordAuthenticating.authenticate (password, username, user: person), asked by Catchup.StartCatchup
then
  Receptivity.open (person)
```

### Catchup.StartCatchup#3

Authored path: `Catchup.StartCatchup`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 48.
- Covered by [Catchup](../design/compositions/Catchup.md), line 97.

```reaction
when Receptivity.open (person, expiresAt, startedAt, window), asked by Catchup.StartCatchup#2
at the flow's settlement frontier
where
  earlier, RequestBoundary.request (password, path: "/catchup/startCatchup", requestId, username)
then
  RequestBoundary.respond (expiresAt, requestId, startedAt, window)
```

### Catchup.ViewMessage

Authored path: `Catchup.ViewMessage`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 82.
- Covered by [Catchup](../design/compositions/Catchup.md), line 101.

```reaction
when RequestBoundary.request (message, password, path: "/catchup/viewMessage", requestId, username)
then
  PasswordAuthenticating.authenticate (password, username)
```

### Catchup.ViewMessage:accessible#2

Authored path: `Catchup.ViewMessage`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 82.
- Covered by [Catchup](../design/compositions/Catchup.md), line 101.

```reaction
when PasswordAuthenticating.authenticate (password, username, user: person), asked by Catchup.ViewMessage
where
  earlier, RequestBoundary.request (message, password, path: "/catchup/viewMessage", requestId, username)
  view "the released message (message) for (person)" with (message, person)
then
  RequestBoundary.respond (record: former "the received message (message) of (person)" with (message, person), requestId)
```

### Catchup.ViewMessage:unavailable#2

Authored path: `Catchup.ViewMessage`.
- Covered by [Catchup](../design/compositions/Catchup.md), line 82.
- Covered by [Catchup](../design/compositions/Catchup.md), line 101.

```reaction
when PasswordAuthenticating.authenticate (password, username, user: person), asked by Catchup.ViewMessage
where
  earlier, RequestBoundary.request (message, password, path: "/catchup/viewMessage", requestId, username)
  no view "the released message (message) for (person)" with (message, person)
then
  RequestBoundary.respond (error: "MESSAGE_UNAVAILABLE", requestId)
```

### DeliverFaultToAsker

```reaction
when any action is faulted, not asked by DeliverFaultToAsker
where
  earlier, RequestBoundary.request (requestId)
then
  RequestBoundary.respondFramework (error: "INTERNAL_ERROR", requestId)
```

### DeliverRefusalToAsker

```reaction
when any action is refused (message), except RequestBoundary
where
  earlier, RequestBoundary.request (requestId)
then
  RequestBoundary.respond (error: message, requestId)
```

## Endpoint input contracts

Before recording an action ask, the boundary rejects a body that is not an
object or lacks a required key. The response uses `INVALID_INPUT` and names
the path or missing key. A declared default fills an absent key. Endpoints
not listed here have no explicit input contract.

- `/catchup/checkUsername` — requires `username`, `password`, `recipientUsername`
- `/catchup/dashboard` — requires `username`, `password`
- `/catchup/endCatchup` — requires `username`, `password`, `window`
- `/catchup/login` — requires `username`, `password`
- `/catchup/register` — requires `username`, `password`
- `/catchup/removeSaved` — requires `username`, `password`, `message`
- `/catchup/save` — requires `username`, `password`, `message`
- `/catchup/send` — requires `username`, `password`, `recipientUsername`, `text`
- `/catchup/sendDrawing` — requires `username`, `password`, `recipientUsername`, `drawing`
- `/catchup/startCatchup` — requires `username`, `password`
- `/catchup/viewMessage` — requires `username`, `password`, `message`
