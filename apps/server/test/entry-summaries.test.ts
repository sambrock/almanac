import { Effect, Layer, Option } from "effect";
import { AiError, LanguageModel } from "effect/ai";
import { SqlClient } from "effect/sql";
import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";

import { makePublicId, UserId } from "../src/domain/ids.ts";
import { BODY, FOLLOW_UPS, JournalEntries } from "../src/features/journal/JournalEntries.ts";
import { JournalDate } from "../src/features/journal/JournalEntry.ts";
import {
  summariseEntry,
  summariseStaleEntries,
} from "../src/features/journal/JournalEntrySummaries.ts";
import { skipWithoutDatabase, withTestSchema } from "./test-database.ts";

test("entries get a title and summary once they stop changing", { skip: skipWithoutDatabase }, () =>
  withTestSchema("test_summaries", async ({ database }) => {
    // Answers with the next queued title, or fails when the queue is empty.
    // Each title gets a one-bullet summary made from it.
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
            : Effect.succeed([
                { type: "text", text: JSON.stringify({ title, summary: [`About ${title}`] }) },
              ]);
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
        const summary = Effect.map(
          entries.get(userId, date),
          (entry) => Option.getOrThrow(entry).summary,
        );

        yield* write("Walked to the lake and saw a heron.");
        titles.push("Heron at the lake");
        yield* summariseStaleEntries;
        assert.equal(prompts.length, 0, "an entry being edited isn't summarised");
        assert.equal(yield* title, null);
        assert.equal(yield* summary, null);

        yield* goIdle;
        yield* summariseStaleEntries;
        assert.equal(yield* title, "Heron at the lake");
        assert.deepEqual(yield* summary, ["About Heron at the lake"]);
        assert.match(prompts[0], /saw a heron/);

        yield* summariseStaleEntries;
        assert.equal(prompts.length, 1, "an unchanged entry isn't summarised again");

        yield* write("Walked to the lake. The heron came back with a fish.");
        assert.equal(yield* summary, null, "a summary of older text isn't shown");
        yield* goIdle;
        titles.push("The heron's fish");
        yield* summariseStaleEntries;
        assert.equal(yield* title, "The heron's fish");

        // The model reads the follow-ups as well as what the user wrote.
        yield* entries.withDoc(userId, date, (doc) =>
          doc.getArray(FOLLOW_UPS).push([
            new Y.Map<string | Y.Text>([
              ["response", "A heron with a fish!"],
              ["question", "How long did you watch it?"],
              ["answer", new Y.Text("Until it flew off.")],
            ]),
          ]),
        );
        yield* goIdle;
        titles.push("Watching the heron");
        yield* summariseStaleEntries;
        assert.match(
          prompts.at(-1)!,
          /<follow_up>A heron with a fish!\\nHow long did you watch it\?<\/follow_up>\\n\\nUntil it flew off\./,
        );

        // The model fails on every attempt, including retries. The old
        // title stays and the entry waits for its next edit.
        yield* write("Rain all day.");
        yield* goIdle;
        const before = prompts.length;
        yield* summariseStaleEntries;
        assert.equal(prompts.length, before + 3);
        assert.equal(yield* title, "Watching the heron");
        yield* summariseStaleEntries;
        assert.equal(prompts.length, before + 3, "a failed entry waits for its next edit");

        // Done summarises an entry straight away, without waiting for it to go idle.
        yield* write("Rain all day, so I read by the window.");
        titles.push("Reading in the rain");
        yield* summariseEntry(userId, date);
        assert.equal(yield* title, "Reading in the rain");
        yield* summariseEntry(userId, date);
        assert.equal(prompts.length, before + 4, "Done on a summarised entry doesn't ask again");

        // Unlike the background job, Done reports a failure and leaves the
        // entry for the next attempt.
        yield* write("Rain all day, so I read by the window. Then soup.");
        const failure = yield* Effect.flip(summariseEntry(userId, date));
        assert.equal(failure._tag, "AiError");
        assert.equal(yield* title, "Reading in the rain");
        titles.push("Soup and a book");
        yield* summariseEntry(userId, date);
        assert.equal(yield* title, "Soup and a book");
      }).pipe(Effect.provide(services), Effect.scoped),
    );
  }),
);
