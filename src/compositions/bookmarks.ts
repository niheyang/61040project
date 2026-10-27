import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { no, where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";
import { credentials, stringInput } from "./validators.ts";
import { AccessibleMessage, MessageDetails } from "./views.ts";

const { PasswordAuthenticating: Auth, Bookmarking } = concepts;

export const Save = endpoint("/catchup/save", ({ username, password, person, message }) =>
  receive({ username, password, message })
    .then(Auth.authenticate({ username, password }).responds({ user: person }))
    .then(
      where(AccessibleMessage({ person, message }))
        .then(Bookmarking.save({ person, item: message }).responds({}))
        .then(respond({ message })).named("accessible"),
      where(no(AccessibleMessage({ person, message })))
        .then(respond({ error: "MESSAGE_UNAVAILABLE" })).named("unavailable"),
    ), stringInput({ ...credentials, message: 100 }));

export const RemoveSaved = endpoint("/catchup/removeSaved", ({ username, password, person, message }) =>
  receive({ username, password, message })
    .then(Auth.authenticate({ username, password }).responds({ user: person }))
    .then(Bookmarking.remove({ person, item: message }).responds({}))
    .then(respond({ message })), stringInput({ ...credentials, message: 100 }));

export const ViewMessage = endpoint("/catchup/viewMessage", ({ username, password, person, message }) =>
  receive({ username, password, message })
    .then(Auth.authenticate({ username, password }).responds({ user: person }))
    .then(
      where(AccessibleMessage({ person, message }))
        .then(respond({ record: MessageDetails({ person, message }) })).named("accessible"),
      where(no(AccessibleMessage({ person, message })))
        .then(respond({ error: "MESSAGE_UNAVAILABLE" })).named("unavailable"),
    ), stringInput({ ...credentials, message: 100 }));
