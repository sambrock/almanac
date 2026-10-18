import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import * as Y from "yjs";

import type { UserId } from "../../domain/ids.ts";
import { type JournalDate, JournalEntrySummary } from "./JournalEntry.ts";

// The entry body lives in this Y.Text. Every client must use the same name.
export const BODY = "body";

export class JournalEntries extends Context.Service<
  JournalEntries,
  {
    list(userId: UserId): Effect.Effect<ReadonlyArray<JournalEntrySummary>>;
    // Runs `f` against the entry's document while holding a lock on the entry,
    // then saves the document if `f` changed it. Returns what `f` returned
    // and the Yjs update describing the change, if there was one.
    withDoc<A>(
      userId: UserId,
      date: JournalDate,
      f: (doc: Y.Doc) => A,
    ): Effect.Effect<{ result: A; update: Option.Option<Uint8Array> }>;
  }
>()("almanac/JournalEntries") {
  static readonly layer = Layer.effect(
    JournalEntries,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const findSummaries = SqlSchema.findAll({
        Request: Schema.String,
        Result: JournalEntrySummary,
        execute: (userId) => sql`
          select "date"::text as "date", left("text", 280) as "preview"
          from "journal_entry"
          where "user_id" = ${userId} and btrim("text") <> ''
          order by "date" desc
        `,
      });

      const findDoc = SqlSchema.findOneOption({
        Request: Schema.Struct({ userId: Schema.String, date: Schema.String }),
        Result: Schema.Struct({ doc: Schema.Uint8Array }),
        execute: ({ userId, date }) => sql`
          select "doc" from "journal_entry"
          where "user_id" = ${userId} and "date" = ${date}
        `,
      });

      const list = Effect.fn("JournalEntries.list")((userId: UserId) =>
        findSummaries(userId).pipe(Effect.orDie),
      );

      const withDoc = Effect.fn("JournalEntries.withDoc")(
        function* <A>(userId: UserId, date: JournalDate, f: (doc: Y.Doc) => A) {
          // Serialises writers to the same entry, including ones on other
          // server instances, so concurrent updates can't overwrite each other.
          yield* sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}/${date}`}, 0))`;

          const doc = new Y.Doc();
          const stored = yield* findDoc({ userId, date });
          if (Option.isSome(stored)) Y.applyUpdate(doc, stored.value.doc);

          const updates: Array<Uint8Array> = [];
          doc.on("update", (update: Uint8Array) => updates.push(update));
          const result = f(doc);

          if (updates.length === 0) return { result, update: Option.none() };

          const state = Y.encodeStateAsUpdate(doc);
          const text = doc.getText(BODY).toString();
          yield* sql`
            insert into "journal_entry" ("user_id", "date", "doc", "text")
            values (${userId}, ${date}, ${state}, ${text})
            on conflict ("user_id", "date") do update
            set "doc" = excluded."doc", "text" = excluded."text", "updated_at" = now()
          `;
          return { result, update: Option.some(Y.mergeUpdates(updates)) };
        },
        (effect) => sql.withTransaction(effect).pipe(Effect.orDie),
      );

      return JournalEntries.of({ list, withDoc });
    }),
  );
}
