import { Effect, Layer, Option, Schedule, Schema } from "effect";
import { LanguageModel } from "effect/ai";
import { SqlClient, SqlSchema } from "effect/sql";

import { UserId } from "../../domain/ids.ts";
import { JournalDate } from "./JournalEntry.ts";

const instructions = `Write a title for the journal entry the user sends, the way its writer might title it. Use two to six words in the entry's own language. Don't use quotation marks or end with a full stop.`;

const EntryTitle = Schema.Struct({ title: Schema.String });

// An entry with text whose title is missing or was written for older text.
const EntryToTitle = Schema.Struct({
  id: Schema.Number,
  text: Schema.String,
  textMd5: Schema.String,
});

const writeTitle = Effect.fn("JournalEntryTitles.writeTitle")(function* (
  entry: typeof EntryToTitle.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const response = yield* LanguageModel.generateObject({
    prompt: [
      { role: "system", content: instructions },
      { role: "user", content: entry.text },
    ],
    schema: EntryTitle,
    objectName: "entry_title",
  }).pipe(Effect.retry({ times: 2, schedule: Schedule.exponential("1 second") }));
  const title = response.value.title.trim().slice(0, 80) || null;
  yield* sql`
    update "journal_entry" set "title" = ${title}, "title_text_md5" = ${entry.textMd5}
    where "id" = ${entry.id}
  `.pipe(Effect.orDie);
});

// Titles the entry now, unless it's empty or its title is already current.
export const titleEntry = Effect.fn("JournalEntryTitles.titleEntry")(function* (
  userId: UserId,
  date: JournalDate,
) {
  const sql = yield* SqlClient.SqlClient;
  const findUntitled = SqlSchema.findOneOption({
    Request: Schema.Struct({ userId: UserId, date: JournalDate }),
    Result: EntryToTitle,
    execute: ({ userId, date }) => sql`
      select "id", "text", md5("text") as "textMd5" from "journal_entry"
      where "user_id" = ${userId} and "date" = ${date}
        and btrim("text") <> ''
        and "title_text_md5" is distinct from md5("text")
    `,
  });
  const entry = yield* findUntitled({ userId, date }).pipe(Effect.orDie);
  if (Option.isSome(entry)) yield* writeTitle(entry.value);
});

// Titles entries the user never pressed Done on, such as ones written on
// mobile. An entry waits until it has gone five minutes without an edit, so
// the title describes what the user wrote rather than a half-written draft.
export const titleStaleEntries = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const findStale = SqlSchema.findAll({
    Request: Schema.Void,
    Result: EntryToTitle,
    execute: () => sql`
      select "id", "text", md5("text") as "textMd5" from "journal_entry"
      where btrim("text") <> ''
        and "updated_at" < now() - interval '5 minutes'
        and "title_text_md5" is distinct from md5("text")
      order by "updated_at" desc
      limit 20
    `,
  });

  for (const entry of yield* findStale(undefined)) {
    yield* writeTitle(entry).pipe(
      // Marking the entry as titled stops a failing entry, such as one the
      // model refuses, from being retried every minute. It's tried again
      // after its next edit.
      Effect.catch((error) =>
        Effect.logWarning("Couldn't title journal entry", error).pipe(
          Effect.andThen(
            sql`update "journal_entry" set "title_text_md5" = ${entry.textMd5} where "id" = ${entry.id}`,
          ),
        ),
      ),
    );
  }
});

export const JournalEntryTitlesLive = Layer.effectDiscard(
  titleStaleEntries.pipe(
    Effect.catchCause((cause) => Effect.logError("Couldn't title journal entries", cause)),
    Effect.repeat(Schedule.spaced("1 minute")),
    Effect.forkScoped,
  ),
);
