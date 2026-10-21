import { Effect } from "effect";
import { SqlClient } from "effect/sql";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // `summary` holds the entry summary's bullet points. The model writes it in
  // the same call as the title, so one md5 now covers both.
  yield* sql`alter table "journal_entry" add column "summary" text[]`;
  yield* sql`alter table "journal_entry" rename column "title_text_md5" to "summarised_text_md5"`;

  // Every existing entry gets a summary, and a fresh title with it, the next
  // time the background job runs.
  yield* sql`update "journal_entry" set "summarised_text_md5" = null`;
});
