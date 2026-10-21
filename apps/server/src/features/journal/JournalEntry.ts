import { Schema } from "effect";

import { JournalEntryPublicId } from "../../domain/ids.ts";

// A calendar day in the user's own time zone, as `YYYY-MM-DD`. Each day has
// at most one journal entry.
export const JournalDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.makeFilter(
    // Rejects dates like 2026-02-30, which `Date` would roll over to March,
    // and year 0, which `Date` accepts but Postgres doesn't.
    (date) => {
      const time = Date.parse(`${date}T00:00:00Z`);
      return (
        date >= "0001-01-01" && !Number.isNaN(time) && new Date(time).toISOString().startsWith(date)
      );
    },
    { expected: "a real calendar date" },
  ),
).pipe(Schema.brand("JournalDate"));
export type JournalDate = typeof JournalDate.Type;

export class JournalEntryListItem extends Schema.Class<JournalEntryListItem>(
  "JournalEntryListItem",
)({
  id: JournalEntryPublicId,
  date: JournalDate,
  // Written by a model when the user presses Done, or once the entry has gone
  // five minutes without an edit.
  title: Schema.NullOr(Schema.String),
  preview: Schema.String,
}) {}

export class JournalEntrySnapshot extends Schema.Class<JournalEntrySnapshot>(
  "JournalEntrySnapshot",
)({
  doc: Schema.Uint8ArrayFromBase64,
  body: Schema.String,
  // The entry summary's bullet points, or null if the entry has changed since
  // they were written.
  summary: Schema.NullOr(Schema.Array(Schema.String)),
}) {}
