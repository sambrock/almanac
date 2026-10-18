import { Effect } from "effect";
import { SqlClient } from "effect/sql";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // `doc` is the entry's Yjs document state and is the source of truth.
  // `text` is a plain-text copy of it, kept in step on every save, for
  // anything that needs to read entries without loading Yjs.
  yield* sql`
    create table "journal_entry" (
      "user_id" text not null references "user" ("id") on delete cascade,
      "date" date not null,
      "doc" bytea not null,
      "text" text not null,
      "created_at" timestamptz default CURRENT_TIMESTAMP not null,
      "updated_at" timestamptz default CURRENT_TIMESTAMP not null,
      primary key ("user_id", "date")
    )
  `;
});
