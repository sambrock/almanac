import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

import { Authorization } from "../auth/Authorization.ts";
import { JournalEntrySummary } from "./JournalEntry.ts";

export class JournalApi extends HttpApiGroup.make("journal")
  .add(
    HttpApiEndpoint.get("list", "/journal/entries", {
      success: Schema.Array(JournalEntrySummary),
    }),
  )
  .middleware(Authorization) {}
