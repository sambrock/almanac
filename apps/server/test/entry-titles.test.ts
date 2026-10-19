import { Effect, Layer } from "effect";
import { AiError, LanguageModel } from "effect/ai";
import { SqlClient } from "effect/sql";
import assert from "node:assert/strict";
import test from "node:test";

import { makePublicId, UserId } from "../src/domain/ids.ts";
import { BODY, JournalEntries } from "../src/features/journal/JournalEntries.ts";
import { JournalDate } from "../src/features/journal/JournalEntry.ts";
import { titleEntry, titleStaleEntries } from "../src/features/journal/JournalEntryTitles.ts";
import { skipWithoutDatabase, withTestSchema } from "./test-database.ts";

test("entries get a title once they stop changing", { skip: skipWithoutDatabase }, () =>
  withTestSchema("test_titles", async ({ database }) => {
    // Answers with the next queued title, or fails when the queue is empty.
    const prompts: Array<string> = [];
    const titles: Array<string> = [];
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: (options) => {
          prompts.push(JSON.stringify(options.prompt.content));
          const title = titles.shift();
          return title === undefined
            ? Effect.fail(
                AiError.make({
                  module: "Test",
                  method: "generateText",
                  reason: new AiError.UnknownError({ description: "No title queued" }),
                }),
              )
            : Effect.succeed([{ type: "text", text: JSON.stringify({ title }) }]);
        },
        streamText: () => {
          throw new Error("Not used");
        },
      }),
    );
    const services = Layer.mergeAll(JournalEntries.layer, model).pipe(Layer.provideMerge(database));

    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const entries = yield* JournalEntries;
        const [{ id }] = yield* sql<{ id: number }>`
            insert into "user" ("public_id", "name", "email", "email_verified")
            values (${makePublicId()}, 'Test', 'test@example.com', true)
            returning "id"
          `;
        const userId = UserId.make(id);
        const date = JournalDate.make("2026-10-18");
        const write = (text: string) =>
          entries.withDoc(userId, date, (doc) => {
            const body = doc.getText(BODY);
            body.delete(0, body.length);
            body.insert(0, text);
          });
        const goIdle = sql`update "journal_entry" set "updated_at" = now() - interval '1 hour'`;
        const title = Effect.map(entries.list(userId), ([entry]) => entry.title);

        yield* write("Walked to the lake and saw a heron.");
        titles.push("Heron at the lake");
        yield* titleStaleEntries;
        assert.equal(prompts.length, 0, "an entry being edited isn't titled");
        assert.equal(yield* title, null);

        yield* goIdle;
        yield* titleStaleEntries;
        assert.equal(yield* title, "Heron at the lake");
        assert.match(prompts[0], /saw a heron/);

        yield* titleStaleEntries;
        assert.equal(prompts.length, 1, "an unchanged entry isn't titled again");

        yield* write("Walked to the lake. The heron came back with a fish.");
        yield* goIdle;
        titles.push("The heron's fish");
        yield* titleStaleEntries;
        assert.equal(yield* title, "The heron's fish");

        // The model fails on every attempt, including retries. The old
        // title stays and the entry waits for its next edit.
        yield* write("Rain all day.");
        yield* goIdle;
        const before = prompts.length;
        yield* titleStaleEntries;
        assert.equal(prompts.length, before + 3);
        assert.equal(yield* title, "The heron's fish");
        yield* titleStaleEntries;
        assert.equal(prompts.length, before + 3, "a failed entry waits for its next edit");

        // Done titles an entry straight away, without waiting for it to go idle.
        yield* write("Rain all day, so I read by the window.");
        titles.push("Reading in the rain");
        yield* titleEntry(userId, date);
        assert.equal(yield* title, "Reading in the rain");
        yield* titleEntry(userId, date);
        assert.equal(prompts.length, before + 4, "Done on a titled entry doesn't ask again");

        // Unlike the background job, Done reports a failure and leaves the
        // entry for the next attempt.
        yield* write("Rain all day, so I read by the window. Then soup.");
        const failure = yield* Effect.flip(titleEntry(userId, date));
        assert.equal(failure._tag, "AiError");
        assert.equal(yield* title, "Reading in the rain");
        titles.push("Soup and a book");
        yield* titleEntry(userId, date);
        assert.equal(yield* title, "Soup and a book");
      }).pipe(Effect.provide(services), Effect.scoped),
    );
  }),
);
