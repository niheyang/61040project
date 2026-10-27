# Receiving

## Purpose

Keep new items hidden until their recipient chooses a period for receiving them.

## Principle

An item arriving while reception is closed waits for its recipient. Opening a
fifteen-minute window makes all waiting items available; items arriving during
the window are available immediately. Closing or expiry stops further arrivals
from becoming available. Released items stay available. Repeated arrivals do not
duplicate an item or change its existing availability.

## Types

```types
external Recipient
  The opaque identity of the person choosing when to receive items.
external Item
  An opaque item identity whose content this concept never inspects.
Status is PENDING or RELEASED or ABSENT
  ABSENT is the query result for an item not recorded for this recipient.
```

## State

```state
a set of Entries with
  a recipient Recipient
  an item Item
  a status Status
  unique recipient and item
a set of Windows with
  a unique person Recipient
  a startedAt DateTime
  an expiresAt DateTime
Rule: An existing entry has status PENDING or RELEASED, never ABSENT.
Rule: A released entry remains released.
Rule: Each new window has a fresh identity and expires fifteen minutes after starting.
Rule: The window and entries for one recipient change atomically.
```

## Actions

```actions
enqueue(recipient: Recipient, item: Item) : returns (recipient: Recipient, item: Item)
  where true
  then
    preserve an existing entry for this recipient and item
    otherwise add one entry whose status is RELEASED exactly when the recipient has a current window and server time is before its expiry, or PENDING otherwise
    returns recipient, item
open(person: Recipient) : returns (window: Window, person: Recipient, startedAt: DateTime, expiresAt: DateTime)
  where true
  then
    replace any previous window for person with a fresh window
    set startedAt to server time and expiresAt to fifteen minutes later
    change every existing PENDING entry for person to RELEASED in the same transition
    returns window, person, startedAt, expiresAt
close(person: Recipient, window: Window) : returns (person: Recipient, window: Window)
  where true
  then
    remove the window only if it is the current window belonging to person
    preserve all entries and their statuses
    preserve state for an unknown, replaced, or other person's window
    returns person, window
expire(window: Window) : returns (window: Window)
  where true
  then
    remove the window only if it still exists and server time is at or after its expiry
    preserve all entries and their statuses
    preserve state for an unknown, replaced, or not-yet-expired window
    returns window
```

## Queries

```queries
_pending(recipient: Recipient) : many (item: Item)
  Returns this recipient's PENDING item identities in identity order, or no rows when none exist.
_released(recipient: Recipient) : many (item: Item)
  Returns this recipient's RELEASED item identities in identity order, or no rows when none exist.
_hasPending(recipient: Recipient) : one (waiting: Flag)
  Returns true exactly when this recipient has a PENDING item, without returning identities or a count or changing state.
_status(recipient: Recipient, item: Item) : one (status: Status)
  Returns the recorded status for this pair, or ABSENT when the pair is unknown.
_current(person: Recipient) : optional (window: Window, person: Recipient, startedAt: DateTime, expiresAt: DateTime)
  Returns the stored window including one awaiting expiry cleanup, or no row if absent.
_active(person: Recipient) : many (window: Window, person: Recipient, startedAt: DateTime, expiresAt: DateTime)
  Returns the person's current window only while server time is before expiry, or no rows otherwise; at most one window exists.
_isOpen(person: Recipient) : one (open: Flag)
  Returns true exactly when the person's current window exists and has not expired; false otherwise.
_expired() : many (window: Window)
  Returns stored windows at or past expiry, ordered by expiresAt then window identity, or no rows when none exist.
```

