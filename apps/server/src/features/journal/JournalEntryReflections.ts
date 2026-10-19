import { AnthropicLanguageModel } from "@effect/ai-anthropic";
import { Effect, Option, Schedule, Schema } from "effect";
import { LanguageModel } from "effect/ai";
import * as Y from "yjs";

import { UserId } from "../../domain/ids.ts";
import { CantGoDeeper } from "./JournalApi.ts";
import { BODY, FOLLOW_UPS, FollowUp, JournalEntries } from "./JournalEntries.ts";
import { JournalDate } from "./JournalEntry.ts";
import { entryRoom, publishUpdate } from "./JournalRelay.ts";

const instructions = `The first message is a journal entry the user just wrote, in Markdown. They pressed Go deeper because they want to think about it more. Respond to something specific they wrote in one or two sentences, then ask one open question that helps them explore it further.

Each later user message is what they wrote after your last question, usually an answer to it. Build on that answer rather than going back to the start, and don't repeat a question you've already asked.

Write like a curious friend, not a therapist or a coach. Don't summarise what they wrote, give advice, or thank them for sharing. Ask about one thing at a time, and keep the question short enough to answer in a few sentences. Write in the entry's own language.`;

const FollowUpObject = Schema.Struct({ response: Schema.String, question: Schema.String });

// Titles use the default Haiku model. Follow-ups are what the user reads and
// reacts to, so they get Opus.
const withFollowUpModel = AnthropicLanguageModel.withConfigOverride({
  model: "claude-opus-5-5",
  max_tokens: 16000,
  output_config: { effort: "medium" },
});

type Message = { role: "user" | "assistant"; content: string };

// The entry as a conversation: the user's writing between follow-ups as user
// messages, and the follow-ups as assistant messages.
const readConversation = (doc: Y.Doc) => {
  const text = doc.getText(BODY).toString();
  const followUps = doc
    .getArray(FOLLOW_UPS)
    .toArray()
    .map((item) => {
      const followUp = Schema.decodeUnknownSync(FollowUp)(item);
      const position = Y.createAbsolutePositionFromRelativePosition(
        Y.createRelativePositionFromJSON(followUp.after),
        doc,
      );
      return { ...followUp, index: position?.index ?? text.length };
    })
    .sort((a, b) => a.index - b.index);

  const messages: Array<Message> = [];
  let start = 0;
  for (const followUp of followUps) {
    const written = text.slice(start, followUp.index).trim();
    if (written) messages.push({ role: "user", content: written });
    messages.push({ role: "assistant", content: `${followUp.response}\n${followUp.question}` });
    start = followUp.index;
  }
  const written = text.slice(start).trim();
  if (written) messages.push({ role: "user", content: written });
  return messages;
};

// Puts the follow-up on its own line at the end of the entry. The user's
// answer goes on the new last line, below it.
const appendFollowUp = (doc: Y.Doc, followUp: { response: string; question: string }) =>
  doc.transact(() => {
    const body = doc.getText(BODY);
    if (!body.toString().endsWith("\n")) body.insert(body.length, "\n");
    const after = Y.relativePositionToJSON(
      Y.createRelativePositionFromTypeIndex(body, body.length, -1),
    );
    doc.getArray(FOLLOW_UPS).push([{ ...followUp, after }]);
  });

export const goDeeper = Effect.fn("JournalEntryReflections.goDeeper")(function* (
  userId: UserId,
  date: JournalDate,
) {
  const entries = yield* JournalEntries;
  const { result: messages } = yield* entries.withDoc(userId, date, readConversation);
  if (messages.length === 0) return yield* new CantGoDeeper({ message: "Write something first" });
  if (messages.at(-1)!.role === "assistant") {
    return yield* new CantGoDeeper({ message: "Answer the question first" });
  }

  const response = yield* LanguageModel.generateObject({
    prompt: [{ role: "system", content: instructions }, ...messages],
    schema: FollowUpObject,
    objectName: "follow_up",
  }).pipe(
    Effect.retry({ times: 2, schedule: Schedule.exponential("1 second") }),
    withFollowUpModel,
  );

  const followUp = {
    response: response.value.response.trim(),
    question: response.value.question.trim(),
  };
  const { update } = yield* entries.withDoc(userId, date, (doc) => appendFollowUp(doc, followUp));
  if (Option.isSome(update)) yield* publishUpdate(entryRoom(userId, date), update.value);
});
