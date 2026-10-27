import { conceptSet, registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/PasswordAuthenticating.md" with { type: "text" };
import { PasswordAuthenticatingConcept, InvalidUsername, InvalidPassword, UsernameTaken, InvalidCredentials } from "./concepts/PasswordAuthenticating.ts";
import messagingSpec from "@design/concepts/Messaging.md" with { type: "text" };
import receivingSpec from "@design/concepts/Receiving.md" with { type: "text" };
import bookmarkingSpec from "@design/concepts/Bookmarking.md" with { type: "text" };
import { Messaging, MessageToSelf, InvalidMessageText, InvalidDrawing } from "./concepts/Messaging.ts";
import { Receiving } from "./concepts/Receiving.ts";
import { Bookmarking } from "./concepts/Bookmarking.ts";

const auth = registerConcept({ class: PasswordAuthenticatingConcept, spec,
  refusals: { INVALID_USERNAME: InvalidUsername, INVALID_PASSWORD: InvalidPassword,
    USERNAME_TAKEN: UsernameTaken, INVALID_CREDENTIALS: InvalidCredentials } });

export const applicationConceptSet = conceptSet({
  PasswordAuthenticating: auth,
  Messaging: registerConcept({ class: Messaging, spec: messagingSpec,
    refusals: { MESSAGE_TO_SELF: MessageToSelf, INVALID_MESSAGE_TEXT: InvalidMessageText,
      INVALID_DRAWING: InvalidDrawing } }),
  Receiving: registerConcept({ class: Receiving, spec: receivingSpec }),
  Bookmarking: registerConcept({ class: Bookmarking, spec: bookmarkingSpec }),
});
export const { concepts } = applicationConceptSet;
