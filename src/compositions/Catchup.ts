import * as authentication from "./authentication.ts";
import * as messages from "./messages.ts";
import * as reception from "./reception.ts";
import * as bookmarks from "./bookmarks.ts";
import * as dashboard from "./dashboard.ts";
import * as views from "./views.ts";

/** Public endpoints, coordination reactions, and authorized views of Catchup. */
export const composition = {
  ...authentication,
  ...messages,
  ...reception,
  ...bookmarks,
  ...dashboard,
  ...views,
};
