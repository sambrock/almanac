import { Schema } from "effect";

// A calendar day in the user's own time zone, as `YYYY-MM-DD`. Each day has
// at most one journal entry.
export const JournalDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.makeFilter(
    // Rejects dates like 2026-02-30, which `Date` would roll over to March.
    (date) => {
      const time = Date.parse(`${date}T00:00:00Z`);
      return !Number.isNaN(time) && new Date(time).toISOString().startsWith(date);
    },
    { expected: "a real calendar date" },
  ),
).pipe(Schema.brand("JournalDate"));
export type JournalDate = typeof JournalDate.Type;

export class JournalEntrySummary extends Schema.Class<JournalEntrySummary>("JournalEntrySummary")({
  date: JournalDate,
  preview: Schema.String,
}) {}
