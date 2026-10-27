import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { no, reaction, when, where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";
import { credentials, drawingInput, stringInput } from "./validators.ts";

const { PasswordAuthenticating: Auth, Messaging, Receiving } = concepts;

export const HoldShare = reaction(({ sender, recipient, text, message }) =>
  when(Messaging.send({ sender, recipient, text }).responds({ message }))
    .then(Receiving.enqueue({ recipient, item: message })));

export const HoldDrawing = reaction(({ sender, recipient, drawing, message }) =>
  when(Messaging.sendDrawing({ sender, recipient, drawing }).responds({ message }))
    .then(Receiving.enqueue({ recipient, item: message })));

export const Send = endpoint("/catchup/send", ({ username, password, recipientUsername, text, sender, recipient, message }) =>
  receive({ username, password, recipientUsername, text })
    .where(Auth._byUsername({ username: recipientUsername }))
    .then(Auth.authenticate({ username, password }).responds({ user: sender }))
    .then(where(Auth._byUsername({ username: recipientUsername }).is({ user: recipient }))
      .then(Messaging.send({ sender, recipient, text }).responds({ message })))
    .afterFlowSettles()
    .where(Receiving._status({ recipient, item: message }).is.not({ status: "ABSENT" }))
    .then(respond({ message })), stringInput({ ...credentials, recipientUsername: 100, text: 10_000 }));

export const SendMissingRecipient = endpoint("/catchup/send", ({ username, password, recipientUsername, text, sender }) =>
  receive({ username, password, recipientUsername, text })
    .where(no(Auth._byUsername({ username: recipientUsername })))
    .then(Auth.authenticate({ username, password }).responds({ user: sender }))
    .then(respond({ error: "RECIPIENT_NOT_FOUND" })));

export const SendDrawing = endpoint("/catchup/sendDrawing", ({ username, password, recipientUsername, drawing, sender, recipient, message }) =>
  receive({ username, password, recipientUsername, drawing })
    .where(Auth._byUsername({ username: recipientUsername }))
    .then(Auth.authenticate({ username, password }).responds({ user: sender }))
    .then(where(Auth._byUsername({ username: recipientUsername }).is({ user: recipient }))
      .then(Messaging.sendDrawing({ sender, recipient, drawing }).responds({ message })))
    .afterFlowSettles()
    .where(Receiving._status({ recipient, item: message }).is.not({ status: "ABSENT" }))
    .then(respond({ message })), drawingInput());

export const SendDrawingMissingRecipient = endpoint("/catchup/sendDrawing", ({ username, password, recipientUsername, drawing, sender }) =>
  receive({ username, password, recipientUsername, drawing })
    .where(no(Auth._byUsername({ username: recipientUsername })))
    .then(Auth.authenticate({ username, password }).responds({ user: sender }))
    .then(respond({ error: "RECIPIENT_NOT_FOUND" })));
