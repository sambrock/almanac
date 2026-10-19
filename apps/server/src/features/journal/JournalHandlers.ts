import { Effect, Option } from "effect";
import { HttpApiBuilder } from "effect/http-api";

import { Api } from "../../Api.ts";
import { CurrentUser } from "../auth/Authorization.ts";
import { EntryTitleFailed } from "./JournalApi.ts";
import { JournalEntries } from "./JournalEntries.ts";
import { titleEntry } from "./JournalEntryTitles.ts";

export const JournalHandlers = HttpApiBuilder.group(Api, "journal", (handlers) =>
  handlers
    .handle("list", () =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const entries = yield* JournalEntries;
        return yield* entries.list(user.userId);
      }),
    )
    .handle("get", ({ params }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        const entries = yield* JournalEntries;
        return Option.getOrNull(yield* entries.get(user.userId, params.date));
      }),
    )
    .handle("title", ({ params }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;
        yield* titleEntry(user.userId, params.date).pipe(
          Effect.tapError((error) => Effect.logWarning("Couldn't title journal entry", error)),
          Effect.mapError(() => new EntryTitleFailed({ message: "Couldn't write a title" })),
        );
      }),
    ),
);
