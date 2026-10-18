import type { JournalGetResponse } from "@almanac/api-client";
import * as Y from "yjs";

export function createJournalDocument(snapshot: JournalGetResponse) {
  const doc = new Y.Doc();
  if (snapshot) {
    const state = Uint8Array.from(atob(snapshot.doc), (character) => character.charCodeAt(0));
    Y.applyUpdate(doc, state);
  }
  return doc;
}
