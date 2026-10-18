import { Effect } from "effect";
import { SqlClient } from "effect/sql";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // `title` is written by the model, never by the user. `title_text_md5` is
  // the md5 of the `text` it was written from, so a title is out of date
  // when the two no longer match.
  yield* sql`
    alter table "journal_entry"
      add column "title" text,
      add column "title_text_md5" text
  `;
});
