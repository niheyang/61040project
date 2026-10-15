# Bookmarking

## Purpose

Keep items a person intends to revisit easy to find.

## Principle

Bob saves an item to his private list. It remains there until he removes it.
Saving again creates no duplicate, and removing an absent item is harmless.

## Types

```types
external User
  The opaque identity of the person keeping a saved list.
external Item
  An opaque item identity that this concept never inspects.
```

## State

```state
a set of SavedPairs with
  a person User
  an item Item
  unique person and item
```

## Actions

```actions
save(person: User, item: Item) : returns (person: User, item: Item)
  where true
  then
    add the pair if absent and otherwise preserve state
    returns person, item
remove(person: User, item: Item) : returns (person: User, item: Item)
  where true
  then
    remove the pair if present and otherwise preserve state
    returns person, item
```

## Queries

```queries
_saved(person: User) : many (item: Item)
  Returns this person's saved item identities in identity order, or no rows when there are none.
```
