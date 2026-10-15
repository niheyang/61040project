# Catchup application types

PasswordAuthenticating owns the stable identities used by the application.

```types
```

```computations
singleItem(item: Messaging.Message) : Holding.ItemBatch
  Returns a one-element collection containing the supplied opaque handle.
```

```instances
instantiate PasswordAuthenticating
instantiate Messaging with
  User is PasswordAuthenticating.User
instantiate Holding with
  Recipient is PasswordAuthenticating.User
  Item is Messaging.Message
instantiate Receptivity with
  User is PasswordAuthenticating.User
instantiate Bookmarking with
  User is PasswordAuthenticating.User
  Item is Messaging.Message
```
