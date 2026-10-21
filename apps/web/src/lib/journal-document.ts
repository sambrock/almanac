import type { JournalGetResponse } from "@almanac/api-client";
import * as Y from "yjs";

// The entry body lives in this Y.Text. Every client must use the same name.
export const BODY = "body";

// Follow-ups live in this Y.Array, after the body. Each is a Y.Map holding
// the AI's `response` and `question` as strings, the user's `answer` as a
// Y.Text, and `references`, the journal dates of earlier entries the
// follow-up mentions. Only the server adds them. Everything before the last
// answer is locked.
export const FOLLOW_UPS = "followUps";

export function createJournalDocument(snapshot: JournalGetResponse) {
  const doc = new Y.Doc();
  if (snapshot) {
    const state = Uint8Array.from(atob(snapshot.doc), (character) => character.charCodeAt(0));
    Y.applyUpdate(doc, state);
  }
  return doc;
}
