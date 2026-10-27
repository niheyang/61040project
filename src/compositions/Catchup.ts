import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { compute, each, former, no, reaction, view, when, where } from "@mit-sdg/sync-engine/language";
import { concepts, computations } from "../concepts.ts";
import { credentials, drawingInput, stringInput } from "./validators.ts";

const { PasswordAuthenticating: Auth, Messaging, Holding, Receptivity, Bookmarking } = concepts;
const Register = endpoint("/catchup/register", ({ username, password, user, canonicalUsername }) =>
  receive({ username, password })
    .then(Auth.register({ username, password }).responds({ user, username: canonicalUsername }))
    .then(respond({ user, username: canonicalUsername })), stringInput(credentials));
const Login = endpoint("/catchup/login", ({ username, password, user, canonicalUsername }) =>
  receive({ username, password })
    .then(Auth.authenticate({ username, password }).responds({ user, username: canonicalUsername }))
    .then(respond({ user, username: canonicalUsername })), stringInput(credentials));

const CheckUsername = endpoint("/catchup/checkUsername", ({ username, password, recipientUsername }) =>
  receive({ username, password, recipientUsername })
    .then(Auth.authenticate({ username, password }).responds({}))
    .then(
      where(Auth._byUsername({ username: recipientUsername }))
        .then(respond({ exists: true })).named("found"),
      where(no(Auth._byUsername({ username: recipientUsername })))
        .then(respond({ exists: false })).named("missing"),
    ), stringInput({ ...credentials, recipientUsername: 100 }));

const CheckUpdates = endpoint("/catchup/checkUpdates", ({ username, password, person, waiting }) =>
  receive({ username, password })
    .then(Auth.authenticate({ username, password }).responds({ user: person }))
    .then(where(Holding._hasPending({ recipient: person }).is({ waiting }))
      .then(respond({ waiting }))), stringInput(credentials));

const ReleasedIncoming = view("a released incoming message of (person)",
  ({ person }, { message, sender, text, drawing, createdAt }) => where(
    Messaging._addressedTo({ user: person }).is({ message, sender, text, drawing, createdAt }),
    Holding._status({ recipient: person, item: message }).is({ status: "RELEASED" }),
  )).many();

const AccessibleMessage = view("the released message (message) for (person)",
  ({ person, message }, { sender, text, drawing, createdAt }) => where(
    Messaging._get({ message }).is({ recipient: person, sender, text, drawing, createdAt }),
    Holding._status({ recipient: person, item: message }).is({ status: "RELEASED" }),
  )).optional();

const Incoming = former("the incoming messages of (person)",
  ({ person }, { message, sender, text, drawing, createdAt, senderUsername, recipientUsername }) =>
    each(ReleasedIncoming({ person }).is({ message, sender, text, drawing, createdAt }))
      .where(Auth._name({ user: sender }).is({ username: senderUsername }),
        Auth._name({ user: person }).is({ username: recipientUsername }))
      .form({ message, sender, recipient: person, text, drawing, createdAt, senderUsername, recipientUsername }));

const Sent = former("the sent messages of (person)",
  ({ person }, { message, recipient, text, drawing, createdAt, status, senderUsername, recipientUsername }) =>
    each(Messaging._sent({ user: person }).is({ message, recipient, text, drawing, createdAt }))
      .where(Holding._status({ recipient, item: message }).is({ status }),
        Auth._name({ user: person }).is({ username: senderUsername }),
        Auth._name({ user: recipient }).is({ username: recipientUsername }))
      .form({ message, sender: person, recipient, text, drawing, createdAt, status, senderUsername, recipientUsername }));

const Saved = former("the saved messages of (person)",
  ({ person }, { message, sender, text, drawing, createdAt, senderUsername, recipientUsername }) =>
    each(Bookmarking._saved({ person }).is({ item: message }))
      .where(AccessibleMessage({ person, message }).is({ sender, text, drawing, createdAt }),
        Auth._name({ user: sender }).is({ username: senderUsername }),
        Auth._name({ user: person }).is({ username: recipientUsername }))
      .form({ message, sender, recipient: person, text, drawing, createdAt, senderUsername, recipientUsername }));

const Windows = former("the active window of (person)",
  ({ person }, { window, startedAt, expiresAt }) =>
    each(Receptivity._active({ person }).is({ window, startedAt, expiresAt }))
      .form({ window, person, startedAt, expiresAt }));

const MessageDetails = former("the received message (message) of (person)",
  ({ person, message }, { sender, text, drawing, createdAt, senderUsername, recipientUsername }) =>
    where(AccessibleMessage({ person, message }).is({ sender, text, drawing, createdAt }),
      Auth._name({ user: sender }).is({ username: senderUsername }),
      Auth._name({ user: person }).is({ username: recipientUsername }))
      .form({ message, sender, recipient: person, text, drawing, createdAt, senderUsername, recipientUsername })).optional();

const HoldShare = reaction(({ sender, recipient, text, message }) =>
  when(Messaging.send({ sender, recipient, text }).responds({ message }))
    .then(Holding.enqueue({ recipient, item: message })));

const HoldDrawing = reaction(({ sender, recipient, drawing, message }) =>
  when(Messaging.sendDrawing({ sender, recipient, drawing }).responds({ message }))
    .then(Holding.enqueue({ recipient, item: message })));

const ReleasePending = reaction(({ person, window, item, items }) =>
  when(Receptivity.open({ person }).responds({ window }))
    .where(Receptivity._current({ person }).is({ window }),
      Receptivity._isOpen({ person }).is({ open: true }),
      Holding._pending({ recipient: person }).is({ item }),
      compute(computations.singleItem, { item }, items))
    .then(Holding.release({ recipient: person, items })));

const ReleaseNewItem = reaction(({ recipient, item, items }) =>
  when(Holding.enqueue({ recipient, item }).responds({}))
    .where(Holding._status({ recipient, item }).is({ status: "PENDING" }),
      Receptivity._isOpen({ person: recipient }).is({ open: true }),
      compute(computations.singleItem, { item }, items))
    .then(Holding.release({ recipient, items })));

const Send = endpoint("/catchup/send", ({ username, password, recipientUsername, text, sender, recipient, message }) =>
  receive({ username, password, recipientUsername, text })
    .where(Auth._byUsername({ username: recipientUsername }))
    .then(Auth.authenticate({ username, password }).responds({ user: sender }))
    .then(where(Auth._byUsername({ username: recipientUsername }).is({ user: recipient }))
      .then(Messaging.send({ sender, recipient, text }).responds({ message })))
    .afterFlowSettles()
    .where(Holding._status({ recipient, item: message }).is.not({ status: "ABSENT" }))
    .then(respond({ message })), stringInput({ ...credentials, recipientUsername: 100, text: 10_000 }));

const SendMissingRecipient = endpoint("/catchup/send", ({ username, password, recipientUsername, text, sender }) =>
  receive({ username, password, recipientUsername, text })
    .where(no(Auth._byUsername({ username: recipientUsername })))
    .then(Auth.authenticate({ username, password }).responds({ user: sender }))
    .then(respond({ error: "RECIPIENT_NOT_FOUND" })));

const SendDrawing = endpoint("/catchup/sendDrawing", ({ username, password, recipientUsername, drawing, sender, recipient, message }) =>
  receive({ username, password, recipientUsername, drawing })
    .where(Auth._byUsername({ username: recipientUsername }))
    .then(Auth.authenticate({ username, password }).responds({ user: sender }))
    .then(where(Auth._byUsername({ username: recipientUsername }).is({ user: recipient }))
      .then(Messaging.sendDrawing({ sender, recipient, drawing }).responds({ message })))
    .afterFlowSettles()
    .where(Holding._status({ recipient, item: message }).is.not({ status: "ABSENT" }))
    .then(respond({ message })), drawingInput());

const SendDrawingMissingRecipient = endpoint("/catchup/sendDrawing", ({ username, password, recipientUsername, drawing, sender }) =>
  receive({ username, password, recipientUsername, drawing })
    .where(no(Auth._byUsername({ username: recipientUsername })))
    .then(Auth.authenticate({ username, password }).responds({ user: sender }))
    .then(respond({ error: "RECIPIENT_NOT_FOUND" })));

const Dashboard = endpoint("/catchup/dashboard", ({ username, password, person }) =>
  receive({ username, password })
    .then(Auth.authenticate({ username, password }).responds({ user: person }))
    .then(respond({ incoming: Incoming({ person }), sent: Sent({ person }),
      saved: Saved({ person }), windows: Windows({ person }) })), stringInput(credentials));

const StartCatchup = endpoint("/catchup/startCatchup", ({ username, password, person, window, startedAt, expiresAt }) =>
  receive({ username, password })
    .then(Auth.authenticate({ username, password }).responds({ user: person }))
    .then(Receptivity.open({ person }).responds({ window, startedAt, expiresAt }))
    .afterFlowSettles().then(respond({ window, startedAt, expiresAt })), stringInput(credentials));

const EndCatchup = endpoint("/catchup/endCatchup", ({ username, password, person, window }) =>
  receive({ username, password, window })
    .then(Auth.authenticate({ username, password }).responds({ user: person }))
    .then(Receptivity.close({ person, window }).responds({}))
    .then(respond({ window })), stringInput({ ...credentials, window: 100 }));

const Save = endpoint("/catchup/save", ({ username, password, person, message }) =>
  receive({ username, password, message })
    .then(Auth.authenticate({ username, password }).responds({ user: person }))
    .then(
      where(AccessibleMessage({ person, message }))
        .then(Bookmarking.save({ person, item: message }).responds({}))
        .then(respond({ message })).named("accessible"),
      where(no(AccessibleMessage({ person, message })))
        .then(respond({ error: "MESSAGE_UNAVAILABLE" })).named("unavailable"),
    ), stringInput({ ...credentials, message: 100 }));

const RemoveSaved = endpoint("/catchup/removeSaved", ({ username, password, person, message }) =>
  receive({ username, password, message })
    .then(Auth.authenticate({ username, password }).responds({ user: person }))
    .then(Bookmarking.remove({ person, item: message }).responds({}))
    .then(respond({ message })), stringInput({ ...credentials, message: 100 }));

const ViewMessage = endpoint("/catchup/viewMessage", ({ username, password, person, message }) =>
  receive({ username, password, message })
    .then(Auth.authenticate({ username, password }).responds({ user: person }))
    .then(
      where(AccessibleMessage({ person, message }))
        .then(respond({ record: MessageDetails({ person, message }) })).named("accessible"),
      where(no(AccessibleMessage({ person, message })))
        .then(respond({ error: "MESSAGE_UNAVAILABLE" })).named("unavailable"),
    ), stringInput({ ...credentials, message: 100 }));

export const composition = { Register, Login, CheckUsername, CheckUpdates, Send, SendMissingRecipient, SendDrawing, SendDrawingMissingRecipient,
  Dashboard, StartCatchup, EndCatchup,
  Save, RemoveSaved, ViewMessage, HoldShare, HoldDrawing, ReleasePending, ReleaseNewItem,
  ReleasedIncoming, AccessibleMessage, Incoming, Sent, Saved, Windows, MessageDetails };
