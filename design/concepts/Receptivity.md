# Receptivity

## Purpose

Let people explicitly limit the periods in which they welcome reception.

## Principle

Bob opens a fifteen-minute receiving window. It remains open until he closes it
or its deadline passes. Starting again replaces it with a fresh window, and a
close or expiry event for the old window cannot remove the replacement.

## Types

```types
external User
  The opaque identity of the person choosing a receiving window.
```

## State

```state
a set of Windows with
  a unique person User
  a startedAt DateTime
  an expiresAt DateTime
Rule: Each window has a fresh identity and expires fifteen minutes after it starts.
Rule: A stored window is open exactly when server time is before expiresAt, even if cleanup has not run.
```

## Actions

```actions
open(person: User) : returns (window: Window, person: User, startedAt: DateTime, expiresAt: DateTime)
  where true
  then
    replace any previous window for person with a fresh window
    set startedAt to server time and expiresAt to fifteen minutes later
    returns window, person, startedAt, expiresAt
close(person: User, window: Window) : returns (person: User, window: Window)
  where true
  then
    remove window only if it is the stored window belonging to person
    preserve state for an unknown, replaced, or other person's window
    returns person, window
expire(window: Window) : returns (window: Window)
  where true
  then
    remove window only if it still exists and server time is at or after expiresAt
    preserve state for an unknown, replaced, or not-yet-expired window
    returns window
```

## Queries

```queries
_current(person: User) : optional (window: Window, person: User, startedAt: DateTime, expiresAt: DateTime)
  Returns the stored window including one awaiting expiry cleanup, or no row if absent.
_isOpen(person: User) : one (open: Flag)
  Returns true exactly when the person's stored window exists and server time is before its expiry; returns false otherwise.
_active(person: User) : many (window: Window, person: User, startedAt: DateTime, expiresAt: DateTime)
  Returns the person's currently open window, or no rows if absent or expired; at most one row exists, so no ordering choice is needed.
_expired() : many (window: Window)
  Returns stored windows with deadlines at or before server time, ordered by expiresAt then window identity; returns no rows when there are none.
```
