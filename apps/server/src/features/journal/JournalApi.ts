import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

import { Authorization } from "../auth/Authorization.ts";
import { JournalDate, JournalEntrySnapshot, JournalEntryListItem } from "./JournalEntry.ts";

export class EntrySummaryFailed extends Schema.TaggedError<EntrySummaryFailed>()(
  "EntrySummaryFailed",
  { message: Schema.String },
  { httpApiStatus: 502 },
) {}

// The entry has no text, or its last follow-up is still waiting for an answer.
export class CantGoDeeper extends Schema.TaggedError<CantGoDeeper>()(
  "CantGoDeeper",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

export class FollowUpFailed extends Schema.TaggedError<FollowUpFailed>()(
  "FollowUpFailed",
  { message: Schema.String },
  { httpApiStatus: 502 },
) {}

export class JournalApi extends HttpApiGroup.make("journal")
  .add(
    HttpApiEndpoint.get("list", "/journal/entries", {
      success: Schema.Array(JournalEntryListItem),
    }),
  )
  .add(
    HttpApiEndpoint.get("get", "/journal/entries/:date", {
      params: { date: JournalDate },
      success: Schema.NullOr(JournalEntrySnapshot),
    }),
  )
  // Writes the entry's title and summary now rather than waiting for it to
  // go idle.
  .add(
    HttpApiEndpoint.post("summarise", "/journal/entries/:date/summary", {
      params: { date: JournalDate },
      error: EntrySummaryFailed,
    }),
  )
  // Has AI add a follow-up to the end of the entry. Open editors get it
  // through journal sync.
  .add(
    HttpApiEndpoint.post("goDeeper", "/journal/entries/:date/follow-ups", {
      params: { date: JournalDate },
      error: [CantGoDeeper, FollowUpFailed],
    }),
  )
  .middleware(Authorization) {}
