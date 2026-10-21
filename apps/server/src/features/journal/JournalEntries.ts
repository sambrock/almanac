import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import * as Y from "yjs";

import { makePublicId, UserId } from "../../domain/ids.ts";
import { JournalDate, JournalEntrySnapshot, JournalEntryListItem } from "./JournalEntry.ts";

// The entry body lives in this Y.Text. Every client must use the same name.
export const BODY = "body";

// Follow-ups live in this Y.Array, after the body. Each is a Y.Map holding
// the AI's `response` and `question` as strings, the user's `answer` as a
// Y.Text, and `references`, an array of the journal dates of earlier entries
// the follow-up mentions. Only the server adds follow-ups. Once there is one,
// clients treat everything before the last answer as locked.
export const FOLLOW_UPS = "followUps";

export const readFollowUps = (doc: Y.Doc) =>
  doc.getArray<Y.Map<string | Y.Text | Array<string>>>(FOLLOW_UPS).map((followUp) => {
    const [response, question, answer] = ["response", "question", "answer"].map(
      (key) => followUp.get(key)?.toString() ?? "",
    );
    // The journal dates of earlier entries the follow-up mentions. Older
    // follow-ups don't have it.
    const references = followUp.get("references");
    return { response, question, answer, references: Array.isArray(references) ? references : [] };
  });

export const readDoc = (state: Uint8Array) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc;
};

// The entry for a model to read: the body, then each follow-up in
// <follow_up> tags followed by the user's answer.
export const entryTranscript = (doc: Y.Doc) =>
  [
    doc.getText(BODY).toString(),
    ...readFollowUps(doc).flatMap(({ response, question, answer }) => [
      `<follow_up>${response}\n${question}</follow_up>`,
      answer,
    ]),
  ]
    .filter((text) => text.trim())
    .join("\n\n");

// Everything the user wrote: the body, then each answer.
const entryText = (doc: Y.Doc) =>
  [
    doc.getText(BODY).toString(),
    ...readFollowUps(doc)
      .map(({ answer }) => answer)
      .filter((answer) => answer.trim()),
  ].join("\n\n");

export class JournalEntries extends Context.Service<
  JournalEntries,
  {
    list(userId: UserId): Effect.Effect<ReadonlyArray<JournalEntryListItem>>;
    get(userId: UserId, date: JournalDate): Effect.Effect<Option.Option<JournalEntrySnapshot>>;
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
        Request: UserId,
        Result: JournalEntryListItem,
        execute: (userId) => sql`
          select "public_id" as "id", "date"::text as "date", "title", left("text", 280) as "preview"
          from "journal_entry"
          where "user_id" = ${userId} and btrim("text") <> ''
          order by "date" desc
        `,
      });

      const findSnapshot = SqlSchema.findOneOption({
        Request: Schema.Struct({ userId: UserId, date: JournalDate }),
        Result: Schema.Struct({
          doc: Schema.Uint8Array,
          body: Schema.String,
          summary: Schema.NullOr(Schema.Array(Schema.String)),
        }),
        execute: ({ userId, date }) => sql`
          select "doc", "text" as "body",
            case when "summarised_text_md5" = md5("text") then "summary" end as "summary"
          from "journal_entry"
          where "user_id" = ${userId} and "date" = ${date}
        `,
      });

      const findDoc = SqlSchema.findOneOption({
        Request: Schema.Struct({ userId: UserId, date: JournalDate }),
        Result: Schema.Struct({ doc: Schema.Uint8Array }),
        execute: ({ userId, date }) => sql`
          select "doc" from "journal_entry"
          where "user_id" = ${userId} and "date" = ${date}
        `,
      });

      const list = Effect.fn("JournalEntries.list")((userId: UserId) =>
        findSummaries(userId).pipe(Effect.orDie),
      );

      const get = Effect.fn("JournalEntries.get")((userId: UserId, date: JournalDate) =>
        findSnapshot({ userId, date }).pipe(
          Effect.map(Option.map((stored) => new JournalEntrySnapshot(stored))),
          Effect.orDie,
        ),
      );

      const withDoc = Effect.fn("JournalEntries.withDoc")(
        function* <A>(userId: UserId, date: JournalDate, f: (doc: Y.Doc) => A) {
          // Serialises writers to the same entry, including ones on other
          // server instances, so concurrent updates can't overwrite each other.
          yield* sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}/${date}`}, 0))`;

          const stored = yield* findDoc({ userId, date });
          const doc = Option.isSome(stored) ? readDoc(stored.value.doc) : new Y.Doc();

          const updates: Array<Uint8Array> = [];
          doc.on("update", (update: Uint8Array) => updates.push(update));
          const result = f(doc);

          if (updates.length === 0) return { result, update: Option.none() };

          const state = Y.encodeStateAsUpdate(doc);
          const text = entryText(doc);
          yield* sql`
            insert into "journal_entry" ("public_id", "user_id", "date", "doc", "text")
            values (${makePublicId()}, ${userId}, ${date}, ${state}, ${text})
            on conflict ("user_id", "date") do update
            set "doc" = excluded."doc", "text" = excluded."text", "updated_at" = now()
          `;
          return { result, update: Option.some(Y.mergeUpdates(updates)) };
        },
        (effect) => sql.withTransaction(effect).pipe(Effect.orDie),
      );

      return JournalEntries.of({ list, get, withDoc });
    }),
  );
}
