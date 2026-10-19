import { Effect } from "effect";
import { SqlClient } from "effect/sql";

import { makePublicId } from "../../domain/ids.ts";

// Public IDs used to come from NanoID's default alphabet, which has
// uppercase letters, `_` and `-`. Give those rows a new lowercase ID.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  for (const table of ["user", "session", "account", "verification", "journal_entry"]) {
    const rows = yield* sql<{ id: number }>`
      select "id" from ${sql(table)} where "public_id" !~ '^[a-z0-9]{21}$'
    `;
    for (const { id } of rows) {
      yield* sql`update ${sql(table)} set "public_id" = ${makePublicId()} where "id" = ${id}`;
    }
  }
});
