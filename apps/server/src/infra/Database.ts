import { PgClient, PgMigrator } from "@effect/sql-pg";
import { Effect } from "effect";
import { join } from "node:path";

import { AppConfig } from "../config/AppConfig.ts";

export const PgLive = PgClient.layerFrom(
  Effect.gen(function* () {
    const { databaseUrl } = yield* AppConfig;
    return yield* PgClient.make({ url: databaseUrl });
  }),
);

export const MigratorLive = PgMigrator.layer({
  loader: PgMigrator.fromFileSystem(join(import.meta.dirname, "migrations")),
});
