import { NodeServices } from "@effect/platform-node";
import { PgClient } from "@effect/sql-pg";
import { Layer, Redacted } from "effect";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { MigratorLive } from "../src/infra/Database.ts";

const databaseUrl = process.env.TEST_DATABASE_URL;

export const skipWithoutDatabase =
  databaseUrl === undefined ? "Set TEST_DATABASE_URL to a local Postgres database" : false;

// Migrations run each time the layer is built.
const migratedDatabase = (url: Redacted.Redacted) =>
  MigratorLive.pipe(Layer.provide(NodeServices.layer), Layer.provideMerge(PgClient.layer({ url })));

// Runs `run` against its own migrated schema, then drops the schema. Each run
// owns a schema and never changes existing app tables.
export async function withTestSchema(
  prefix: string,
  run: (test: {
    url: Redacted.Redacted;
    database: ReturnType<typeof migratedDatabase>;
  }) => Promise<void>,
) {
  const schema = `${prefix}_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`create schema "${schema}"`);
  try {
    const searchPathUrl = new URL(databaseUrl!);
    searchPathUrl.searchParams.set("options", `-csearch_path=${schema}`);
    const url = Redacted.make(searchPathUrl.toString());
    await run({ url, database: migratedDatabase(url) });
  } finally {
    await admin.query(`drop schema "${schema}" cascade`);
    await admin.end();
  }
}
