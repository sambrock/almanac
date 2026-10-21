import { Effect, Layer, Option, Schedule, Schema } from "effect";
import { LanguageModel } from "effect/ai";
import { SqlClient, SqlSchema } from "effect/sql";

import { UserId } from "../../domain/ids.ts";
import { entryTranscript, readDoc } from "./JournalEntries.ts";
import { JournalDate } from "./JournalEntry.ts";

const instructions = `The user sends a journal entry they wrote, in Markdown. If they went deeper on it, follow-up questions from AI come after it in <follow_up> tags, each followed by what the user wrote back. Write a title and a summary of the entry.

The title names what the entry is about, the way its writer might title it. Use two to six words, without quotation marks or a full stop.

The summary is a list of bullet points. The writer reads them at the end of the entry, and AI reads them in later entries to recall what they wrote, so each bullet should make sense on its own months from now. Give each bullet one thing worth remembering: something that happened, how they felt, what they realised or decided, what worries them, what they mean to do. Address the writer as "you" and keep their own words for the key phrase. Write one or two bullets for a short entry and up to five for a long one. Only mention what AI asked when an answer doesn't make sense without it.

Write both in the entry's own language.`;

const EntrySummary = Schema.Struct({ title: Schema.String, summary: Schema.Array(Schema.String) });

// An entry with text whose title and summary are missing or were written for
// older text.
const EntryToSummarise = Schema.Struct({
  id: Schema.Number,
  doc: Schema.Uint8Array,
  textMd5: Schema.String,
});

const writeSummary = Effect.fn("JournalEntrySummaries.writeSummary")(function* (
  entry: typeof EntryToSummarise.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const response = yield* LanguageModel.generateObject({
    prompt: [
      { role: "system", content: instructions },
      { role: "user", content: entryTranscript(readDoc(entry.doc)) },
    ],
    schema: EntrySummary,
    objectName: "entry_summary",
  }).pipe(Effect.retry({ times: 2, schedule: Schedule.exponential("1 second") }));
  const title = response.value.title.trim().slice(0, 80) || null;
  const summary = response.value.summary.map((bullet) => bullet.trim()).filter(Boolean);
  yield* sql`
    update "journal_entry"
    set "title" = ${title}, "summary" = ${summary}, "summarised_text_md5" = ${entry.textMd5}
    where "id" = ${entry.id}
  `.pipe(Effect.orDie);
});

// Summarises the entry now, unless it's empty or its summary is already
// current.
export const summariseEntry = Effect.fn("JournalEntrySummaries.summariseEntry")(function* (
  userId: UserId,
  date: JournalDate,
) {
  const sql = yield* SqlClient.SqlClient;
  const findUnsummarised = SqlSchema.findOneOption({
    Request: Schema.Struct({ userId: UserId, date: JournalDate }),
    Result: EntryToSummarise,
    execute: ({ userId, date }) => sql`
      select "id", "doc", md5("text") as "textMd5" from "journal_entry"
      where "user_id" = ${userId} and "date" = ${date}
        and btrim("text") <> ''
        and "summarised_text_md5" is distinct from md5("text")
    `,
  });
  const entry = yield* findUnsummarised({ userId, date }).pipe(Effect.orDie);
  if (Option.isSome(entry)) yield* writeSummary(entry.value);
});

// Summarises entries the user never pressed Done on, such as ones written on
// mobile. An entry waits until it has gone five minutes without an edit, so
// the summary describes what the user wrote rather than a half-written draft.
export const summariseStaleEntries = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const findStale = SqlSchema.findAll({
    Request: Schema.Void,
    Result: EntryToSummarise,
    execute: () => sql`
      select "id", "doc", md5("text") as "textMd5" from "journal_entry"
      where btrim("text") <> ''
        and "updated_at" < now() - interval '5 minutes'
        and "summarised_text_md5" is distinct from md5("text")
      order by "updated_at" desc
      limit 20
    `,
  });

  for (const entry of yield* findStale(undefined)) {
    yield* writeSummary(entry).pipe(
      // Marking the entry as summarised stops a failing entry, such as one
      // the model refuses, from being retried every minute. It's tried again
      // after its next edit.
      Effect.catch((error) =>
        Effect.logWarning("Couldn't summarise journal entry", error).pipe(
          Effect.andThen(
            sql`update "journal_entry" set "summarised_text_md5" = ${entry.textMd5} where "id" = ${entry.id}`,
          ),
        ),
      ),
    );
  }
});

export const JournalEntrySummariesLive = Layer.effectDiscard(
  summariseStaleEntries.pipe(
    Effect.catchCause((cause) => Effect.logError("Couldn't summarise journal entries", cause)),
    Effect.repeat(Schedule.spaced("1 minute")),
    Effect.forkScoped,
  ),
);
