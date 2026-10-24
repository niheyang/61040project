# Messaging

## Purpose

Preserve the content and original creation time of private exchanges.

## Principle

Alice records a text message or freehand drawing for Bob. It retains its content,
participants, and original creation time. Bob can continue the exchange by sending
a separate message to Alice. Blank, oversized, or malformed content and messages
to oneself are refused.

## Types

```types
external User
  An opaque participant identity supplied by the application.
opaque Drawing
  A versioned 600 by 300 stroke drawing. Version 1 contains only the fields version,
  width, height, and strokes. Each stroke has a permitted color and bounded point
  data consisting of position, time, and pressure. A drawing has visible content,
  at most 120 strokes and 3000 total points, and at most 96000 serialized UTF-8 bytes.
opaque OptionalDrawing
  Either a Drawing or null. A text message has null; a drawing message has a Drawing.
```

## State

```state
a set of Messages with
  a sender User
  a recipient User
  a text String
  a drawing OptionalDrawing
  a createdAt DateTime
Rule: Messages are immutable after creation.
Rule: A sender differs from the recipient.
Rule: Each message has either trimmed text of 1 to 2000 characters with no drawing, or a valid drawing with empty text.
```

## Actions

```actions
send(sender: User, recipient: User, text: String) : returns (message: Message)
  where sender equals recipient
  then
    refuses MESSAGE_TO_SELF "Choose another person as the recipient."
  where sender differs from recipient and trimmed text has fewer than 1 or more than 2000 characters
  then
    refuses INVALID_MESSAGE_TEXT "Write a message of 1–2,000 characters."
  where sender differs from recipient and trimmed text has 1 to 2000 characters
  then
    add a fresh message with sender, recipient, trimmed text, null drawing, and the server's current time as createdAt
    returns message
sendDrawing(sender: User, recipient: User, drawing: Drawing) : returns (message: Message)
  where sender equals recipient
  then
    refuses MESSAGE_TO_SELF "Choose another person as the recipient."
  where sender differs from recipient and drawing is blank, oversized, or malformed
  then
    refuses INVALID_DRAWING "Draw something before sending, and keep the drawing within the size limit."
  where sender differs from recipient and drawing is valid
  then
    add a fresh message with sender, recipient, empty text, a sanitized copy of drawing, and the server's current time as createdAt
    returns message
```

## Queries

```queries
_get(message: Message) : optional (message: Message, sender: User, recipient: User, text: String, drawing: OptionalDrawing, createdAt: DateTime)
  Returns the immutable record for message, or no row if message is unknown. Legacy text records without a stored drawing field return null drawing.
_sent(user: User) : many (message: Message, sender: User, recipient: User, text: String, drawing: OptionalDrawing, createdAt: DateTime)
  Returns records whose sender is user, ordered by createdAt then message identity; returns no rows when there are none.
_addressedTo(user: User) : many (message: Message, sender: User, recipient: User, text: String, drawing: OptionalDrawing, createdAt: DateTime)
  Returns records whose recipient is user, ordered by createdAt then message identity; returns no rows when there are none.
```
