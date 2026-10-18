import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

import { Api } from "../../Api.ts";
import { CurrentUser } from "../auth/Authorization.ts";
import { JournalEntries } from "./JournalEntries.ts";

export const JournalHandlers = HttpApiBuilder.group(Api, "journal", (handlers) =>
  handlers.handle("list", () =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;
      const entries = yield* JournalEntries;
      return yield* entries.list(user.id);
    }),
  ),
);
