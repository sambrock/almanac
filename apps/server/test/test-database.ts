import { PgClient } from "@effect/sql-pg";
import { Effect, Redacted } from "effect";
import { nanoid } from "nanoid";
import { Pool } from "pg";

import migration1 from "../src/infra/migrations/0001_better_auth.ts";
import migration2 from "../src/infra/migrations/0002_journal.ts";
import migration3 from "../src/infra/migrations/0003_entry_title.ts";

const databaseUrl = process.env.TEST_DATABASE_URL;

export const skipWithoutDatabase =
  databaseUrl === undefined ? "Set TEST_DATABASE_URL to a local Postgres database" : false;

// Runs `run` against its own migrated schema, then drops the schema. Each run
// owns a schema and never changes existing app tables.
export async function withTestSchema(
  prefix: string,
  run: (test: {
    url: Redacted.Redacted;
    database: ReturnType<typeof PgClient.layer>;
  }) => Promise<void>,
) {
  const schema = `${prefix}_${nanoid().replaceAll("-", "_").toLowerCase()}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`create schema "${schema}"`);
  try {
    const url = new URL(databaseUrl!);
    url.searchParams.set("options", `-csearch_path=${schema}`);
    const database = PgClient.layer({ url: Redacted.make(url.toString()) });
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* migration1;
        yield* migration2;
        yield* migration3;
      }).pipe(Effect.provide(database), Effect.scoped),
    );
    await run({ url: Redacted.make(url.toString()), database });
  } finally {
    await admin.query(`drop schema "${schema}" cascade`);
    await admin.end();
  }
}
