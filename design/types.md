# Catchup application types

PasswordAuthenticating owns the stable identities used by the application.
Receiving owns the receiving window and the availability of opaque message handles.

```types
```

```instances
instantiate PasswordAuthenticating
instantiate Messaging with
  User is PasswordAuthenticating.User
instantiate Receiving with
  Recipient is PasswordAuthenticating.User
  Item is Messaging.Message
instantiate Bookmarking with
  User is PasswordAuthenticating.User
  Item is Messaging.Message
```
