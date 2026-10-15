# PasswordAuthenticating

## Purpose

Identify users and prevent one person from acting as another.

## Principle

A person registers a username and password. Authenticating those credentials
later returns the same user identity; incorrect credentials are refused.

## Types

```types
opaque PasswordHash
  A salted password verifier, never returned by a public operation.
```

## State

```state
a set of Users with
  a unique username String
  a passwordHash PasswordHash
```

## Actions

```actions
register(username: String, password: String) : returns (user: User, username: String)
  where username does not have 3 to 24 letters, digits, or underscores after trimming
  then
    refuses INVALID_USERNAME "Use 3 to 24 letters, digits, or underscores."
  where password does not have 8 to 128 characters
  then
    refuses INVALID_PASSWORD "Use a password with 8 to 128 characters."
  where the trimmed lowercase username already exists
  then
    refuses USERNAME_TAKEN "That username is already registered."
  where the username and password are valid and the canonical username is unused
  then
    add a new user with the canonical username and a salted Argon2id password hash
    returns user, username

authenticate(username: String, password: String) : returns (user: User, username: String)
  where the trimmed lowercase username exists and its password hash verifies password
  then
    returns user, username
  where no user verifies these credentials
  then
    refuses INVALID_CREDENTIALS "The username or password is incorrect."
```

## Queries

```queries
_byUsername(username: String) : optional (user: User)
  Returns the user with the trimmed lowercase username, or no row.

_name(user: User) : optional (username: String)
  Returns the username for an existing user, or no row; never returns credentials.
```
