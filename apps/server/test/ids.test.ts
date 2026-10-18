import { PgClient } from "@effect/sql-pg";
import { Effect, Layer, Option, Redacted } from "effect";
import { SqlClient } from "effect/sql";
import { nanoid } from "nanoid";
import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { AppConfig } from "../src/config/AppConfig.ts";
import { BetterAuth } from "../src/features/auth/BetterAuth.ts";
import { sessionUser } from "../src/features/auth/sessionUser.ts";
import { BODY, JournalEntries } from "../src/features/journal/JournalEntries.ts";
import { JournalDate } from "../src/features/journal/JournalEntry.ts";
import { Mailer } from "../src/infra/Mailer.ts";
import migration1 from "../src/infra/migrations/0001_better_auth.ts";
import migration2 from "../src/infra/migrations/0002_journal.ts";

const databaseUrl = process.env.TEST_DATABASE_URL;
const publicIdPattern = /^[A-Za-z0-9_-]{21}$/;

test(
  "integer keys and public IDs work through auth and journal saves",
  {
    skip: databaseUrl === undefined ? "Set TEST_DATABASE_URL to a local Postgres database" : false,
  },
  async () => {
    // Each run owns a schema and never changes existing app tables.
    const schema = `test_ids_${nanoid().replaceAll("-", "_").toLowerCase()}`;
    const admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`create schema "${schema}"`);
    const url = new URL(databaseUrl!);
    url.searchParams.set("options", `-csearch_path=${schema}`);
    const database = PgClient.layer({ url: Redacted.make(url.toString()) });
    const services = Layer.mergeAll(BetterAuth.layer, JournalEntries.layer).pipe(
      Layer.provideMerge(database),
      Layer.provide(
        Layer.succeed(AppConfig, {
          port: 3001,
          databaseUrl: Redacted.make(url.toString()),
          betterAuthSecret: Redacted.make("test-secret-for-database-id-integration-tests"),
          betterAuthUrl: "http://localhost:3001",
          webOrigin: "http://localhost:3000",
          devOtpCode: Option.some("102030"),
        }),
      ),
      Layer.provide(Layer.succeed(Mailer, { sendOtp: () => Effect.void })),
    );

    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          yield* migration1;
          yield* migration2;
        }).pipe(Effect.provide(database), Effect.scoped),
      );
      await Effect.runPromise(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const auth = yield* BetterAuth;
          const entries = yield* JournalEntries;

          const signIn = (email: string) =>
            Effect.promise(async () => {
              await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
              const [verification] = await sql<{ id: number; public_id: string }>`
                select "id", "public_id" from "verification"
              `.pipe(Effect.runPromise);
              assert.equal(typeof verification.id, "number");
              assert.match(verification.public_id, publicIdPattern);
              const { headers, response } = await auth.api.signInEmailOTP({
                body: { email, otp: "102030" },
                returnHeaders: true,
              });
              return {
                ...response,
                cookie: headers
                  .getSetCookie()
                  .map((cookie) => cookie.split(";")[0])
                  .join("; "),
              };
            });

          const first = yield* signIn("first@example.com");
          const second = yield* signIn("second@example.com");
          assert.equal(first.user.id, "1");
          assert.equal(second.user.id, "2");

          const headers = new Headers({ Authorization: `Bearer ${first.token}` });
          const current = Option.getOrThrow(yield* sessionUser(auth, headers));
          assert.equal(current.id, 1);
          assert.match(current.user.id, publicIdPattern);
          const [storedUser] = yield* sql<{ public_id: string }>`
            select "public_id" from "user" where "id" = ${current.id}
          `;
          assert.equal(current.user.id, storedUser.public_id);
          assert.equal(current.user.email, "first@example.com");
          const cookieUser = Option.getOrThrow(
            yield* sessionUser(
              auth,
              new Headers({
                Cookie: first.cookie,
              }),
            ),
          );
          assert.equal(cookieUser.id, current.id);

          const context = yield* Effect.promise(() => auth.$context);
          yield* Effect.promise(() =>
            context.internalAdapter.createAccount({
              userId: first.user.id,
              accountId: first.user.id,
              providerId: "credential",
            }),
          );
          for (const table of ["user", "session", "account", "verification"]) {
            const rows = yield* sql<{ id: number; public_id: string }>`
              select "id", "public_id" from ${sql(table)}
            `;
            for (const row of rows) {
              assert.equal(typeof row.id, "number");
              assert.match(row.public_id, publicIdPattern);
            }
          }

          const date = JournalDate.make("2026-10-18");
          yield* entries.withDoc(current.id, date, () => undefined);
          assert.deepEqual(yield* entries.list(current.id), []);
          const empty = yield* sql`select * from "journal_entry"`;
          assert.equal(empty.length, 0);

          yield* entries.withDoc(current.id, date, (doc) => doc.getText(BODY).insert(0, "Hello"));
          const [entry] = yield* entries.list(current.id);
          assert.match(entry.id, publicIdPattern);
          assert.equal(entry.preview, "Hello");
          yield* entries.withDoc(current.id, date, (doc) => doc.getText(BODY).insert(5, " world"));
          const [updated] = yield* entries.list(current.id);
          assert.equal(updated.id, entry.id);
          assert.equal(updated.preview, "Hello world");
          const other = Option.getOrThrow(
            yield* sessionUser(
              auth,
              new Headers({
                Authorization: `Bearer ${second.token}`,
              }),
            ),
          );
          assert.deepEqual(yield* entries.list(other.id), []);
          assert.notEqual(current.user.id, other.user.id);
          yield* entries.withDoc(other.id, date, (doc) =>
            doc.getText(BODY).insert(0, "Other user"),
          );
          const [otherEntry] = yield* entries.list(other.id);
          assert.notEqual(otherEntry.id, entry.id);
          const stored = yield* sql<{ id: number; user_id: number }>`
            select "id", "user_id" from "journal_entry" order by "id"
          `;
          assert.equal(stored.length, 2);
          assert.equal(typeof stored[0].id, "number");
          assert.deepEqual(
            stored.map((row) => row.user_id),
            [current.id, other.id],
          );

          yield* sql`delete from "user" where "id" = ${current.id}`;
          for (const table of ["session", "account", "journal_entry"]) {
            const remaining: ReadonlyArray<{ user_id: number }> = yield* sql<{
              user_id: number;
            }>`select "user_id" from ${sql(table)} where "user_id" = ${current.id}`;
            assert.equal(remaining.length, 0);
          }
        }).pipe(Effect.provide(services), Effect.scoped),
      );
    } finally {
      await admin.query(`drop schema "${schema}" cascade`);
      await admin.end();
    }
  },
);
