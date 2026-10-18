import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

import { Authorization } from "../auth/Authorization.ts";
import { JournalDate, JournalEntrySnapshot, JournalEntrySummary } from "./JournalEntry.ts";

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
  .middleware(Authorization) {}
