import { Effect, Layer, Option, Redacted, Schema } from "effect";
import { SqlClient } from "effect/sql";
import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";

import { AppConfig } from "../src/config/AppConfig.ts";
import { BetterAuth } from "../src/features/auth/BetterAuth.ts";
import { sessionUser } from "../src/features/auth/sessionUser.ts";
import { BODY, JournalEntries } from "../src/features/journal/JournalEntries.ts";
import { JournalDate, JournalEntrySnapshot } from "../src/features/journal/JournalEntry.ts";
import { Mailer } from "../src/infra/Mailer.ts";
import { skipWithoutDatabase, withTestSchema } from "./test-database.ts";

const publicIdPattern = /^[a-z0-9]{21}$/;

test(
  "integer keys and public IDs work through auth and journal saves",
  { skip: skipWithoutDatabase },
  () =>
    withTestSchema("test_ids", async ({ url, database }) => {
      const services = Layer.mergeAll(BetterAuth.layer, JournalEntries.layer).pipe(
        Layer.provideMerge(database),
        Layer.provide(
          Layer.succeed(AppConfig, {
            port: 3001,
            databaseUrl: url,
            betterAuthSecret: Redacted.make("test-secret-for-database-id-integration-tests"),
            betterAuthUrl: "http://localhost:3001",
            webOrigin: "http://localhost:3000",
            devOtpCode: Option.some("102030"),
          }),
        ),
        Layer.provide(Layer.succeed(Mailer, { sendOtp: () => Effect.void })),
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
          assert.equal(current.userId, 1);
          assert.match(current.user.id, publicIdPattern);
          const [storedUser] = yield* sql<{ public_id: string }>`
            select "public_id" from "user" where "id" = ${current.userId}
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
          assert.equal(cookieUser.userId, current.userId);

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
          assert.ok(Option.isNone(yield* entries.get(current.userId, date)));
          yield* entries.withDoc(current.userId, date, () => undefined);
          assert.deepEqual(yield* entries.list(current.userId), []);
          const empty = yield* sql`select * from "journal_entry"`;
          assert.equal(empty.length, 0);

          yield* entries.withDoc(current.userId, date, (doc) =>
            doc.getText(BODY).insert(0, "Hello"),
          );
          const [entry] = yield* entries.list(current.userId);
          assert.match(entry.id, publicIdPattern);
          assert.equal(entry.preview, "Hello");
          yield* entries.withDoc(current.userId, date, (doc) =>
            doc.getText(BODY).insert(5, " world"),
          );
          const [updated] = yield* entries.list(current.userId);
          assert.equal(updated.id, entry.id);
          assert.equal(updated.preview, "Hello world");
          const snapshot = Option.getOrThrow(yield* entries.get(current.userId, date));
          assert.equal(snapshot.body, "Hello world");
          const encodedSnapshot = Schema.encodeSync(JournalEntrySnapshot)(snapshot);
          assert.equal(typeof encodedSnapshot.doc, "string");
          assert.deepEqual(
            Schema.decodeUnknownSync(JournalEntrySnapshot)(encodedSnapshot).doc,
            snapshot.doc,
          );
          const loaded = new Y.Doc();
          Y.applyUpdate(loaded, snapshot.doc);
          assert.equal(loaded.getText(BODY).toString(), "Hello world");
          loaded.destroy();
          const other = Option.getOrThrow(
            yield* sessionUser(
              auth,
              new Headers({
                Authorization: `Bearer ${second.token}`,
              }),
            ),
          );
          assert.deepEqual(yield* entries.list(other.userId), []);
          assert.ok(Option.isNone(yield* entries.get(other.userId, date)));
          assert.notEqual(current.user.id, other.user.id);
          yield* entries.withDoc(other.userId, date, (doc) =>
            doc.getText(BODY).insert(0, "Other user"),
          );
          const [otherEntry] = yield* entries.list(other.userId);
          assert.notEqual(otherEntry.id, entry.id);
          const stored = yield* sql<{ id: number; user_id: number }>`
            select "id", "user_id" from "journal_entry" order by "id"
          `;
          assert.equal(stored.length, 2);
          assert.equal(typeof stored[0].id, "number");
          assert.deepEqual(
            stored.map((row) => row.user_id),
            [current.userId, other.userId],
          );

          yield* sql`delete from "user" where "id" = ${current.userId}`;
          for (const table of ["session", "account", "journal_entry"]) {
            const remaining: ReadonlyArray<{ user_id: number }> = yield* sql<{
              user_id: number;
            }>`select "user_id" from ${sql(table)} where "user_id" = ${current.userId}`;
            assert.equal(remaining.length, 0);
          }
        }).pipe(Effect.provide(services), Effect.scoped),
      );
    }),
);
