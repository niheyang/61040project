import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";
import { credentials, stringInput } from "./validators.ts";

const { PasswordAuthenticating: Auth, Receiving } = concepts;

export const CheckUpdates = endpoint("/catchup/checkUpdates", ({ username, password, person, waiting }) =>
  receive({ username, password })
    .then(Auth.authenticate({ username, password }).responds({ user: person }))
    .then(where(Receiving._hasPending({ recipient: person }).is({ waiting }))
      .then(respond({ waiting }))), stringInput(credentials));

export const StartCatchup = endpoint("/catchup/startCatchup", ({ username, password, person, window, startedAt, expiresAt }) =>
  receive({ username, password })
    .then(Auth.authenticate({ username, password }).responds({ user: person }))
    .then(Receiving.open({ person }).responds({ window, startedAt, expiresAt }))
    .afterFlowSettles().then(respond({ window, startedAt, expiresAt })), stringInput(credentials));

export const EndCatchup = endpoint("/catchup/endCatchup", ({ username, password, person, window }) =>
  receive({ username, password, window })
    .then(Auth.authenticate({ username, password }).responds({ user: person }))
    .then(Receiving.close({ person, window }).responds({}))
    .then(respond({ window })), stringInput({ ...credentials, window: 100 }));
