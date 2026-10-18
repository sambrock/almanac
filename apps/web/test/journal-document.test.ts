import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";

import { createJournalDocument } from "../src/lib/journal-document.ts";

test("a prefetched document contains saved text before live sync and merges concurrent edits", () => {
  const server = new Y.Doc();
  server.getText("body").insert(0, "Saved entry 🌱");
  const snapshot = {
    body: server.getText("body").toString(),
    doc: Buffer.from(Y.encodeStateAsUpdate(server)).toString("base64"),
  };
  const client = createJournalDocument(snapshot);
  try {
    assert.equal(client.getText("body").toString(), snapshot.body);
    client.getText("body").insert(0, "Local edit. ");
    server.getText("body").insert(server.getText("body").length, " Remote edit.");
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server));
    Y.applyUpdate(server, Y.encodeStateAsUpdate(client));
    assert.equal(client.getText("body").toString(), "Local edit. Saved entry 🌱 Remote edit.");
    assert.equal(client.getText("body").toString(), server.getText("body").toString());
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server));
    assert.equal(client.getText("body").toString(), "Local edit. Saved entry 🌱 Remote edit.");
  } finally {
    client.destroy();
    server.destroy();
  }
});

test("a date without an entry starts with an empty document", () => {
  const doc = createJournalDocument(null);
  assert.equal(doc.getText("body").toString(), "");
  doc.destroy();
});
