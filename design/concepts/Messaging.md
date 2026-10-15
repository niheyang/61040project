# Messaging

## Purpose

Preserve the content and original creation time of private exchanges.

## Principle

Alice records a message for Bob. It retains its text, participants, and original
creation time. Bob can continue the exchange by sending a separate message to
Alice. Blank or oversized text and messages to oneself are refused.

## Types

```types
external User
  An opaque participant identity supplied by the application.
```

## State

```state
a set of Messages with
  a sender User
  a recipient User
  a text String
  a createdAt DateTime
Rule: Messages are immutable after creation.
Rule: A sender differs from the recipient and trimmed text has 1 to 2000 characters.
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
    add a fresh message with sender, recipient, trimmed text, and the server's current time as createdAt
    returns message
```

## Queries

```queries
_get(message: Message) : optional (message: Message, sender: User, recipient: User, text: String, createdAt: DateTime)
  Returns the immutable record for message, or no row if message is unknown.
_sent(user: User) : many (message: Message, sender: User, recipient: User, text: String, createdAt: DateTime)
  Returns records whose sender is user, ordered by createdAt then message identity; returns no rows when there are none.
_addressedTo(user: User) : many (message: Message, sender: User, recipient: User, text: String, createdAt: DateTime)
  Returns records whose recipient is user, ordered by createdAt then message identity; returns no rows when there are none.
```
