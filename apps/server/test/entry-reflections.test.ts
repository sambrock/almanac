import { Effect, Layer, PubSub } from "effect";
import { AiError, LanguageModel } from "effect/ai";
import { SqlClient } from "effect/sql";
import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";

import { makePublicId, UserId } from "../src/domain/ids.ts";
import { BODY, FOLLOW_UPS, JournalEntries } from "../src/features/journal/JournalEntries.ts";
import { JournalDate } from "../src/features/journal/JournalEntry.ts";
import { goDeeper } from "../src/features/journal/JournalEntryReflections.ts";
import { JournalRelay } from "../src/features/journal/JournalRelay.ts";
import { skipWithoutDatabase, withTestSchema } from "./test-database.ts";

test("going deeper adds follow-ups between the user's writing", { skip: skipWithoutDatabase }, () =>
  withTestSchema("test_reflections", async ({ database }) => {
    // Answers with the next queued follow-up, or fails when the queue is empty.
    const prompts: Array<ReadonlyArray<{ role: string; text: string }>> = [];
    const followUps: Array<{ response: string; question: string }> = [];
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: (options) => {
          prompts.push(
            options.prompt.content.map((message) => ({
              role: message.role,
              text: JSON.stringify(message.content),
            })),
          );
          const followUp = followUps.shift();
          return followUp === undefined
            ? Effect.fail(
                AiError.make({
                  module: "Test",
                  method: "generateText",
                  reason: new AiError.UnknownError({ description: "No follow-up queued" }),
                }),
              )
            : Effect.succeed([{ type: "text", text: JSON.stringify(followUp) }]);
        },
        streamText: () => {
          throw new Error("Not used");
        },
      }),
    );
    const services = Layer.mergeAll(JournalEntries.layer, JournalRelay.layer, model).pipe(
      Layer.provideMerge(database),
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const entries = yield* JournalEntries;
        const relay = yield* JournalRelay;
        const [{ id }] = yield* sql<{ id: number }>`
            insert into "user" ("public_id", "name", "email", "email_verified")
            values (${makePublicId()}, 'Test', 'test@example.com', true)
            returning "id"
          `;
        const userId = UserId.make(id);
        const date = JournalDate.make("2026-10-19");
        const write = (index: number | "end", text: string) =>
          entries.withDoc(userId, date, (doc) => {
            const body = doc.getText(BODY);
            body.insert(index === "end" ? body.length : index, text);
          });
        // The body, and where in it each follow-up shows.
        const read = Effect.map(
          entries.withDoc(userId, date, (doc) => ({
            body: doc.getText(BODY).toString(),
            anchors: doc
              .getArray<{ after: unknown }>(FOLLOW_UPS)
              .map(
                ({ after }) =>
                  Y.createAbsolutePositionFromRelativePosition(
                    Y.createRelativePositionFromJSON(after),
                    doc,
                  )?.index,
              ),
          })),
          ({ result }) => result,
        );

        const empty = yield* Effect.flip(goDeeper(userId, date));
        assert.equal(empty.message, "Write something first");

        yield* write(0, "The review with Jo went badly.");
        followUps.push({
          response: "That sounds deflating.",
          question: "What did you want Jo to see?",
        });
        yield* goDeeper(userId, date);
        assert.deepEqual(yield* read, { body: "The review with Jo went badly.\n", anchors: [31] });
        assert.match(prompts[0][1].text, /review with Jo/);

        const unanswered = yield* Effect.flip(goDeeper(userId, date));
        assert.equal(unanswered.message, "Answer the question first");

        // The answer is ordinary entry text, written below the follow-up.
        const subscription = yield* PubSub.subscribe(relay);
        yield* write("end", "How much work went into it.");
        followUps.push({ response: "Effort counts.", question: "Who else noticed it?" });
        yield* goDeeper(userId, date);
        assert.deepEqual(
          prompts[1].map((message) => message.role),
          ["system", "user", "assistant", "user"],
        );
        assert.match(prompts[1][2].text, /What did you want Jo to see\?/);
        assert.match(prompts[1][3].text, /How much work went into it/);
        assert.deepEqual(yield* read, {
          body: "The review with Jo went badly.\nHow much work went into it.\n",
          anchors: [31, 59],
        });
        const relayed = yield* PubSub.take(subscription);
        assert.equal(relayed.room, `${userId}/${date}`, "open editors get the new follow-up");

        // Follow-ups stay with the text they follow when earlier text changes.
        yield* write(0, "Today. ");
        assert.deepEqual((yield* read).anchors, [38, 66]);
      }).pipe(Effect.provide(services), Effect.scoped),
    );
  }),
);
