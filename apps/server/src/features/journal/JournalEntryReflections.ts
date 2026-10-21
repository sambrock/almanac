import { AnthropicLanguageModel } from "@effect/ai-anthropic";
import { Effect, Option, Schedule, Schema } from "effect";
import { AiError, LanguageModel, Prompt, Tool, Toolkit } from "effect/ai";
import { SqlClient, SqlSchema } from "effect/sql";
import * as Y from "yjs";

import { UserId } from "../../domain/ids.ts";
import { CantGoDeeper } from "./JournalApi.ts";
import {
  BODY,
  FOLLOW_UPS,
  JournalEntries,
  entryTranscript,
  readDoc,
  readFollowUps,
} from "./JournalEntries.ts";
import { JournalDate } from "./JournalEntry.ts";
import { entryRoom, publishUpdate } from "./JournalRelay.ts";

const instructions = `The first user message is a journal entry the user just wrote, in Markdown. They pressed Go deeper because they want to think about it more. Respond to something specific they wrote in one or two sentences, then ask one open question that helps them explore it further.

Each later user message is what they wrote after your last question, usually an answer to it. Build on that answer rather than going back to the start, and don't repeat a question you've already asked.

Write like a curious friend, not a therapist or a coach. Don't summarise what they wrote, give advice, or thank them for sharing. Ask about one thing at a time, and keep the question short enough to answer in a few sentences. Write in the entry's own language.

You may also get a list of the user's earlier entries, oldest first, each with its date, title and summary. Bring one in when today's writing connects to it: a worry that has come back, a plan they made, a view that has changed, progress on something they found hard. Most follow-ups don't need the past. Mention it only when the link is real and they'd find it interesting, and not in every follow-up. Before you mention an earlier entry, call read_entry to read what they actually wrote, and say roughly when they wrote it, such as "in March" or "last week".

Call write_follow_up to give your follow-up. Don't reply with text.`;

const ReadEntry = Tool.make("read_entry", {
  description: "Reads one of the user's earlier entries in full, with any follow-ups and answers.",
  parameters: Schema.Struct({
    date: Schema.String.annotate({ description: "The entry's journal date, as YYYY-MM-DD" }),
  }),
  success: Schema.String,
});

const FollowUp = Schema.Struct({
  response: Schema.String.annotate({
    description: "One or two sentences responding to the entry or the last answer",
  }),
  question: Schema.String.annotate({ description: "One open question" }),
  references: Schema.Array(Schema.String).annotate({
    description: "The dates of any earlier entries the follow-up mentions, as YYYY-MM-DD",
  }),
});

// Returns the follow-up it was given, which is how the loop below reads it.
const WriteFollowUp = Tool.make("write_follow_up", {
  description: "Adds your follow-up to the end of the entry.",
  parameters: FollowUp,
  success: FollowUp,
});

const ReflectionTools = Toolkit.make(ReadEntry, WriteFollowUp);

// The model calls read_entry a few times at most before writing.
const MAX_STEPS = 6;

// Summaries use the default Sonnet model. Follow-ups are what the user reads
// and reacts to, so they get Opus.
const withFollowUpModel = AnthropicLanguageModel.withConfigOverride({
  model: "claude-opus-5-5",
  max_tokens: 16000,
  output_config: { effort: "medium" },
});

// The entry as a conversation: the body and answers as user messages, and the
// follow-ups as assistant messages.
const readConversation = (doc: Y.Doc) => {
  const messages: Array<Prompt.MessageEncoded> = [];
  const addWriting = (text: string) => {
    if (text.trim()) messages.push({ role: "user", content: text.trim() });
  };
  addWriting(doc.getText(BODY).toString());
  for (const followUp of readFollowUps(doc)) {
    messages.push({ role: "assistant", content: `${followUp.response}\n${followUp.question}` });
    addWriting(followUp.answer);
  }
  return messages;
};

const PastEntry = Schema.Struct({
  date: JournalDate,
  title: Schema.NullOr(Schema.String),
  summary: Schema.Array(Schema.String),
});

const describePastEntries = (
  date: JournalDate,
  pastEntries: ReadonlyArray<typeof PastEntry.Type>,
) =>
  [
    "The user's earlier entries:",
    ...pastEntries.map(({ date, title, summary }) =>
      [`${date}${title ? ` · ${title}` : ""}`, ...summary.map((bullet) => `- ${bullet}`)].join(
        "\n",
      ),
    ),
    `Today's entry is for ${date}.`,
  ].join("\n\n");

// The empty answer becomes the only text the user can edit.
const appendFollowUp = (doc: Y.Doc, followUp: typeof FollowUp.Type) =>
  doc.getArray(FOLLOW_UPS).push([
    new Y.Map<string | Y.Text | ReadonlyArray<string>>([
      ["response", followUp.response],
      ["question", followUp.question],
      ["answer", new Y.Text()],
      ["references", followUp.references],
    ]),
  ]);

export const goDeeper = Effect.fn("JournalEntryReflections.goDeeper")(function* (
  userId: UserId,
  date: JournalDate,
) {
  const sql = yield* SqlClient.SqlClient;
  const entries = yield* JournalEntries;
  const { result: messages } = yield* entries.withDoc(userId, date, readConversation);
  if (messages.length === 0) return yield* new CantGoDeeper({ message: "Write something first" });
  if (messages.at(-1)!.role === "assistant") {
    return yield* new CantGoDeeper({ message: "Answer the question first" });
  }

  // Only entries from before this one, so going deeper on an old entry
  // doesn't know what came after it.
  const findPastEntries = SqlSchema.findAll({
    Request: Schema.Struct({ userId: UserId, date: JournalDate }),
    Result: PastEntry,
    execute: ({ userId, date }) => sql`
      select "date"::text as "date", "title", "summary" from "journal_entry"
      where "user_id" = ${userId} and "date" < ${date} and cardinality("summary") > 0
      order by "date"
    `,
  });
  const findPastDoc = SqlSchema.findOneOption({
    Request: Schema.Struct({ userId: UserId, date: Schema.String }),
    Result: Schema.Struct({ doc: Schema.Uint8Array }),
    execute: ({ userId, date: pastDate }) => sql`
      select "doc" from "journal_entry"
      where "user_id" = ${userId} and "date"::text = ${pastDate} and "date" < ${date}
    `,
  });
  const pastEntries = yield* findPastEntries({ userId, date }).pipe(Effect.orDie);

  const toolkit = ReflectionTools.pipe(
    Effect.provide(
      ReflectionTools.toLayer({
        read_entry: ({ date }) =>
          findPastDoc({ userId, date }).pipe(
            Effect.map(
              Option.match({
                onNone: () => `There's no entry for ${date} before today.`,
                onSome: ({ doc }) => entryTranscript(readDoc(doc)),
              }),
            ),
            Effect.orDie,
          ),
        write_follow_up: (followUp) => Effect.succeed(followUp),
      }),
    ),
  );

  // The instructions and earlier entries stay the same for every follow-up
  // on this entry, so they're cached.
  const initialPrompt = Prompt.make([
    { role: "system", content: instructions },
    ...(pastEntries.length > 0
      ? [
          {
            role: "system" as const,
            content: describePastEntries(date, pastEntries),
            options: { anthropic: { cacheControl: { type: "ephemeral" as const } } },
          },
        ]
      : []),
    ...messages,
  ]);

  // Runs the model until it calls write_follow_up, feeding it the entries it
  // asks to read along the way.
  const writeFollowUp = Effect.gen(function* () {
    let prompt = initialPrompt;
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = yield* LanguageModel.generateText({ prompt, toolkit });
      for (const result of response.toolResults) {
        if (result.name === "write_follow_up" && !result.isFailure) return result.result;
      }
      if (response.toolCalls.length === 0) break;
      prompt = Prompt.concat(prompt, Prompt.fromResponseParts(response.content));
    }
    return yield* AiError.make({
      module: "JournalEntryReflections",
      method: "goDeeper",
      reason: new AiError.InvalidOutputError({ description: "The model didn't write a follow-up" }),
    });
  });

  const written = yield* writeFollowUp.pipe(
    Effect.retry({ times: 2, schedule: Schedule.exponential("1 second") }),
    withFollowUpModel,
  );

  const pastDates = new Set<string>(pastEntries.map((entry) => entry.date));
  const followUp = {
    response: written.response.trim(),
    question: written.question.trim(),
    references: [...new Set(written.references)].filter((date) => pastDates.has(date)).sort(),
  };
  const { update } = yield* entries.withDoc(userId, date, (doc) => appendFollowUp(doc, followUp));
  if (Option.isSome(update)) yield* publishUpdate(entryRoom(userId, date), update.value);
});
