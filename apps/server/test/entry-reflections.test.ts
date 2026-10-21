import { Effect, Layer, PubSub } from "effect";
import { AiError, LanguageModel } from "effect/ai";
import { SqlClient } from "effect/sql";
import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";

import { makePublicId, UserId } from "../src/domain/ids.ts";
import {
  BODY,
  FOLLOW_UPS,
  JournalEntries,
  readFollowUps,
} from "../src/features/journal/JournalEntries.ts";
import { JournalDate } from "../src/features/journal/JournalEntry.ts";
import { goDeeper } from "../src/features/journal/JournalEntryReflections.ts";
import { JournalRelay } from "../src/features/journal/JournalRelay.ts";
import { skipWithoutDatabase, withTestSchema } from "./test-database.ts";

type ToolCall = { name: string; params: unknown };

test("going deeper adds follow-ups that the user answers", { skip: skipWithoutDatabase }, () =>
  withTestSchema("test_reflections", async ({ database }) => {
    // Each request answers with the next queued step: the tool calls the
    // model makes, or an empty list for a text reply. Fails when the queue
    // is empty.
    const prompts: Array<ReadonlyArray<{ role: string; text: string }>> = [];
    const steps: Array<ReadonlyArray<ToolCall>> = [];
    const writeFollowUp = (response: string, question: string, references: Array<string> = []) =>
      steps.push([{ name: "write_follow_up", params: { response, question, references } }]);
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
          const step = steps.shift();
          if (step === undefined) {
            return Effect.fail(
              AiError.make({
                module: "Test",
                method: "generateText",
                reason: new AiError.UnknownError({ description: "No step queued" }),
              }),
            );
          }
          return Effect.succeed(
            step.length === 0
              ? [{ type: "text", text: "Here's a thought." }]
              : step.map((call, index) => ({
                  type: "tool-call",
                  id: `call-${prompts.length}-${index}`,
                  ...call,
                })),
          );
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
        const writeBody = (date: JournalDate, text: string) =>
          entries.withDoc(userId, date, (doc) => doc.getText(BODY).insert(0, text));
        const writeAnswer = (text: string) =>
          entries.withDoc(userId, date, (doc) => {
            const followUps = doc.getArray<Y.Map<string | Y.Text>>(FOLLOW_UPS);
            const answer = followUps.get(followUps.length - 1).get("answer");
            assert.ok(answer instanceof Y.Text);
            answer.insert(answer.length, text);
          });
        const read = Effect.map(
          entries.withDoc(userId, date, readFollowUps),
          ({ result }) => result,
        );

        const empty = yield* Effect.flip(goDeeper(userId, date));
        assert.equal(empty.message, "Write something first");

        yield* writeBody(date, "The review with Jo went badly.");
        writeFollowUp("That sounds deflating.", "What did you want Jo to see?");
        yield* goDeeper(userId, date);
        assert.deepEqual(yield* read, [
          {
            response: "That sounds deflating.",
            question: "What did you want Jo to see?",
            answer: "",
            references: [],
          },
        ]);
        assert.deepEqual(
          prompts[0].map((message) => message.role),
          ["system", "user"],
          "with no earlier entries, the model gets just the instructions",
        );
        assert.match(prompts[0][1].text, /review with Jo/);

        const unanswered = yield* Effect.flip(goDeeper(userId, date));
        assert.equal(unanswered.message, "Answer the question first");

        const subscription = yield* PubSub.subscribe(relay);
        yield* writeAnswer("How much work went into it.");
        writeFollowUp("Effort counts.", "Who else noticed it?");
        yield* goDeeper(userId, date);
        assert.deepEqual(
          prompts[1].map((message) => message.role),
          ["system", "user", "assistant", "user"],
        );
        assert.match(prompts[1][2].text, /What did you want Jo to see\?/);
        assert.match(prompts[1][3].text, /How much work went into it/);
        assert.deepEqual(
          (yield* read).map(({ answer }) => answer),
          ["How much work went into it.", ""],
        );
        const relayed = yield* PubSub.take(subscription);
        assert.equal(relayed.room, `${userId}/${date}`, "open editors get the new follow-up");

        // Answers count as the entry's text, for previews and summaries.
        const [summary] = yield* entries.list(userId);
        assert.equal(
          summary.preview,
          "The review with Jo went badly.\n\nHow much work went into it.",
        );

        // An earlier entry with a summary, and a later one the model
        // shouldn't know about.
        const earlier = JournalDate.make("2026-09-02");
        const later = JournalDate.make("2026-10-25");
        yield* writeBody(earlier, "Jo said my last review was the best on the team.");
        yield* writeBody(later, "Jo left the company.");
        yield* sql`
          update "journal_entry" set "title" = 'Praise from Jo', "summary" = ${["Jo praised your review"]}
          where "date" = ${earlier}
        `;
        yield* sql`
          update "journal_entry" set "summary" = ${["Jo left"]} where "date" = ${later}
        `;

        yield* writeAnswer("Nobody, really.");
        steps.push([
          { name: "read_entry", params: { date: earlier } },
          { name: "read_entry", params: { date: later } },
        ]);
        writeFollowUp("In September Jo called your review the best.", "What changed?", [
          earlier,
          later,
          earlier,
          "2026-01-01",
        ]);
        yield* goDeeper(userId, date);
        const [instructions, pastEntries] = prompts[2];
        assert.equal(instructions.role, "system");
        assert.equal(pastEntries.role, "system");
        assert.match(pastEntries.text, /2026-09-02 · Praise from Jo\\n- Jo praised your review/);
        assert.doesNotMatch(pastEntries.text, /Jo left/, "later entries stay hidden");
        const toolResults = prompts[3].at(-1)!;
        assert.equal(toolResults.role, "tool");
        assert.match(toolResults.text, /best on the team/);
        assert.match(toolResults.text, /There's no entry for 2026-10-25 before today/);
        assert.deepEqual(
          (yield* read).at(-1)!.references,
          [earlier],
          "references only name earlier entries the model was shown",
        );

        // A model that replies with text instead of writing a follow-up fails,
        // after two retries.
        yield* writeAnswer("Me, I suppose.");
        steps.push([], [], []);
        const failure = yield* Effect.flip(goDeeper(userId, date));
        assert.equal(failure._tag, "AiError");
        assert.equal(steps.length, 0);
        assert.equal((yield* read).length, 3);
      }).pipe(Effect.provide(services), Effect.scoped),
    );
  }),
);
