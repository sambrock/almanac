import type { JournalGetResponse } from "@almanac/api-client";
import * as Y from "yjs";

// The entry body lives in this Y.Text. Every client must use the same name.
export const BODY = "body";

// Follow-ups live in this Y.Array, apart from the body. Each one shows just
// after the body character that `after` points to. Only the server adds them.
export const FOLLOW_UPS = "followUps";
export type FollowUp = { response: string; question: string; after: unknown };

export function createJournalDocument(snapshot: JournalGetResponse) {
  const doc = new Y.Doc();
  if (snapshot) {
    const state = Uint8Array.from(atob(snapshot.doc), (character) => character.charCodeAt(0));
    Y.applyUpdate(doc, state);
  }
  return doc;
}
