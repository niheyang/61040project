# Holding

## Purpose

Retain opaque items until their release is explicitly authorized.

## Principle

Enqueueing an item for a recipient makes it pending. Releasing it makes it
available permanently. Repeated enqueueing or release creates no extra entry
and cannot make a released item pending again.

## Types

```types
external Recipient
  The opaque identity for whom an item is held.
external Item
  An opaque item identity that this concept never inspects.
opaque ItemBatch
  A finite ordered collection of Item handles supplied or returned as one value.
Status is PENDING or RELEASED or ABSENT
  ABSENT is a query result for a pair without an entry.
```

## State

```state
a set of Entries with
  a recipient Recipient
  an item Item
  a status Status
  unique recipient and item
Rule: An existing entry has status PENDING or RELEASED, never ABSENT.
Rule: A released entry remains released.
```

## Actions

```actions
enqueue(recipient: Recipient, item: Item) : returns (recipient: Recipient, item: Item)
  where true
  then
    add a PENDING entry for the pair if absent, otherwise preserve its state
    returns recipient, item
release(recipient: Recipient, items: ItemBatch) : returns (released: ItemBatch)
  where true
  then
    change this recipient's PENDING entries for supplied items to RELEASED
    set released to only the items changed by this action, without duplicates and in their first supplied order
    preserve unknown or already released pairs
    returns released
```

## Queries

```queries
_pending(recipient: Recipient) : many (item: Item)
  Returns this recipient's pending item identities in identity order, or no rows when there are none.
_hasPending(recipient: Recipient) : one (waiting: Flag)
  Returns true exactly when this recipient has at least one PENDING entry, without returning item identities or a count or changing any state.
_released(recipient: Recipient) : many (item: Item)
  Returns this recipient's released item identities in identity order, or no rows when there are none.
_status(recipient: Recipient, item: Item) : one (status: Status)
  Returns PENDING or RELEASED for an existing pair, or ABSENT for an unknown pair.
```
