import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

import { Authorization } from "../auth/Authorization.ts";
import { JournalDate, JournalEntrySnapshot, JournalEntrySummary } from "./JournalEntry.ts";

export class EntryTitleFailed extends Schema.TaggedError<EntryTitleFailed>()(
  "EntryTitleFailed",
  { message: Schema.String },
  { httpApiStatus: 502 },
) {}

export class JournalApi extends HttpApiGroup.make("journal")
  .add(
    HttpApiEndpoint.get("list", "/journal/entries", {
      success: Schema.Array(JournalEntrySummary),
    }),
  )
  .add(
    HttpApiEndpoint.get("get", "/journal/entries/:date", {
      params: { date: JournalDate },
      success: Schema.NullOr(JournalEntrySnapshot),
    }),
  )
  // Titles the entry now rather than waiting for it to go idle.
  .add(
    HttpApiEndpoint.post("title", "/journal/entries/:date/title", {
      params: { date: JournalDate },
      error: EntryTitleFailed,
    }),
  )
  .middleware(Authorization) {}
