import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { concepts } from "../concepts.ts";
import { credentials, stringInput } from "./validators.ts";
import { Incoming, Sent, Saved, Windows } from "./views.ts";

const { PasswordAuthenticating: Auth } = concepts;

export const Dashboard = endpoint("/catchup/dashboard", ({ username, password, person }) =>
  receive({ username, password })
    .then(Auth.authenticate({ username, password }).responds({ user: person }))
    .then(respond({ incoming: Incoming({ person }), sent: Sent({ person }),
      saved: Saved({ person }), windows: Windows({ person }) })), stringInput(credentials));
