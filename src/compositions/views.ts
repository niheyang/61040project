import { each, former, view, where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";

const { PasswordAuthenticating: Auth, Messaging, Receiving, Bookmarking } = concepts;

export const ReleasedIncoming = view("a released incoming message of (person)",
  ({ person }, { message, sender, text, drawing, createdAt }) => where(
    Messaging._addressedTo({ user: person }).is({ message, sender, text, drawing, createdAt }),
    Receiving._status({ recipient: person, item: message }).is({ status: "RELEASED" }),
  )).many();

export const AccessibleMessage = view("the released message (message) for (person)",
  ({ person, message }, { sender, text, drawing, createdAt }) => where(
    Messaging._get({ message }).is({ recipient: person, sender, text, drawing, createdAt }),
    Receiving._status({ recipient: person, item: message }).is({ status: "RELEASED" }),
  )).optional();

export const Incoming = former("the incoming messages of (person)",
  ({ person }, { message, sender, text, drawing, createdAt, senderUsername, recipientUsername }) =>
    each(ReleasedIncoming({ person }).is({ message, sender, text, drawing, createdAt }))
      .where(Auth._name({ user: sender }).is({ username: senderUsername }),
        Auth._name({ user: person }).is({ username: recipientUsername }))
      .form({ message, sender, recipient: person, text, drawing, createdAt, senderUsername, recipientUsername }));

export const Sent = former("the sent messages of (person)",
  ({ person }, { message, recipient, text, drawing, createdAt, status, senderUsername, recipientUsername }) =>
    each(Messaging._sent({ user: person }).is({ message, recipient, text, drawing, createdAt }))
      .where(Receiving._status({ recipient, item: message }).is({ status }),
        Auth._name({ user: person }).is({ username: senderUsername }),
        Auth._name({ user: recipient }).is({ username: recipientUsername }))
      .form({ message, sender: person, recipient, text, drawing, createdAt, status, senderUsername, recipientUsername }));

export const Saved = former("the saved messages of (person)",
  ({ person }, { message, sender, text, drawing, createdAt, senderUsername, recipientUsername }) =>
    each(Bookmarking._saved({ person }).is({ item: message }))
      .where(AccessibleMessage({ person, message }).is({ sender, text, drawing, createdAt }),
        Auth._name({ user: sender }).is({ username: senderUsername }),
        Auth._name({ user: person }).is({ username: recipientUsername }))
      .form({ message, sender, recipient: person, text, drawing, createdAt, senderUsername, recipientUsername }));

export const Windows = former("the active window of (person)",
  ({ person }, { window, startedAt, expiresAt }) =>
    each(Receiving._active({ person }).is({ window, startedAt, expiresAt }))
      .form({ window, person, startedAt, expiresAt }));

export const MessageDetails = former("the received message (message) of (person)",
  ({ person, message }, { sender, text, drawing, createdAt, senderUsername, recipientUsername }) =>
    where(AccessibleMessage({ person, message }).is({ sender, text, drawing, createdAt }),
      Auth._name({ user: sender }).is({ username: senderUsername }),
      Auth._name({ user: person }).is({ username: recipientUsername }))
      .form({ message, sender, recipient: person, text, drawing, createdAt, senderUsername, recipientUsername })).optional();
