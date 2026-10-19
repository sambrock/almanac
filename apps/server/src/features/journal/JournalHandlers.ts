import { Effect, Option } from "effect";
import { HttpApiBuilder } from "effect/http-api";

import { Api } from "../../Api.ts";
import { CurrentUser } from "../auth/Authorization.ts";
import { EntryTitleFailed, FollowUpFailed } from "./JournalApi.ts";
import { JournalEntries } from "./JournalEntries.ts";
import { goDeeper } from "./JournalEntryReflections.ts";
import { titleEntry } from "./JournalEntryTitles.ts";

export const JournalHandlers = HttpApiBuilder.group(Api, "journal", (handlers) =>
  handlers
    .handle("list", () =>
      Effect.gen(function* () {
        const { userId } = yield* CurrentUser;
        const entries = yield* JournalEntries;
        return yield* entries.list(userId);
      }),
    )
    .handle("get", ({ params }) =>
      Effect.gen(function* () {
        const { userId } = yield* CurrentUser;
        const entries = yield* JournalEntries;
        return Option.getOrNull(yield* entries.get(userId, params.date));
      }),
    )
    .handle("title", ({ params }) =>
      Effect.gen(function* () {
        const { userId } = yield* CurrentUser;
        yield* titleEntry(userId, params.date).pipe(
          Effect.tapError((error) => Effect.logWarning("Couldn't title journal entry", error)),
          Effect.mapError(() => new EntryTitleFailed({ message: "Couldn't write a title" })),
        );
      }),
    )
    .handle("goDeeper", ({ params }) =>
      Effect.gen(function* () {
        const { userId } = yield* CurrentUser;
        yield* goDeeper(userId, params.date).pipe(
          Effect.catchTag("AiError", (error) =>
            Effect.logWarning("Couldn't write a follow-up", error).pipe(
              Effect.andThen(Effect.fail(new FollowUpFailed({ message: "Couldn't go deeper" }))),
            ),
          ),
        );
      }),
    ),
);
