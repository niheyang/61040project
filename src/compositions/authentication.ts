import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { no, where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";
import { credentials, stringInput } from "./validators.ts";

const { PasswordAuthenticating: Auth } = concepts;

export const Register = endpoint("/catchup/register", ({ username, password, user, canonicalUsername }) =>
  receive({ username, password })
    .then(Auth.register({ username, password }).responds({ user, username: canonicalUsername }))
    .then(respond({ user, username: canonicalUsername })), stringInput(credentials));

export const Login = endpoint("/catchup/login", ({ username, password, user, canonicalUsername }) =>
  receive({ username, password })
    .then(Auth.authenticate({ username, password }).responds({ user, username: canonicalUsername }))
    .then(respond({ user, username: canonicalUsername })), stringInput(credentials));

export const CheckUsername = endpoint("/catchup/checkUsername", ({ username, password, recipientUsername }) =>
  receive({ username, password, recipientUsername })
    .then(Auth.authenticate({ username, password }).responds({}))
    .then(
      where(Auth._byUsername({ username: recipientUsername }))
        .then(respond({ exists: true })).named("found"),
      where(no(Auth._byUsername({ username: recipientUsername })))
        .then(respond({ exists: false })).named("missing"),
    ), stringInput({ ...credentials, recipientUsername: 100 }));
