/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";

import { applyTextChange } from "../src/lib/journal-text.ts";

const bodyOf = (content: string) => {
  const doc = new Y.Doc();
  const body = doc.getText("body");
  body.insert(0, content);
  return body;
};

for (const [name, before, after] of [
  ["types at the end", "Went for a run", "Went for a run."],
  ["types in the middle", "Went for run", "Went for a run"],
  ["deletes a selection", "Went for a long run", "Went for a run"],
  ["replaces a selection", "Went for a run", "Went for a swim"],
  ["pastes into an empty entry", "", "Went for a run"],
  ["clears the entry", "Went for a run", ""],
  ["replaces one emoji with another", "Run 😀", "Run 😃"],
  ["types after an emoji", "Run 😀", "Run 😀😃"],
] as const) {
  test(`applyTextChange ${name}`, () => {
    const body = bodyOf(before);
    applyTextChange(body, after);
    assert.equal(body.toString(), after);
  });
}

test("applyTextChange sends one update per change", () => {
  const body = bodyOf("Went for a run");
  let updates = 0;
  body.doc!.on("update", () => updates++);
  applyTextChange(body, "Went for a swim");
  assert.equal(updates, 1);
});

test("applyTextChange keeps an edit made on another device", () => {
  const phone = bodyOf("Went for a run");
  const web = new Y.Doc();
  Y.applyUpdate(web, Y.encodeStateAsUpdate(phone.doc!));

  web.getText("body").insert(0, "Monday. ");
  applyTextChange(phone, "Went for a run. Felt good.");

  Y.applyUpdate(phone.doc!, Y.encodeStateAsUpdate(web));
  Y.applyUpdate(web, Y.encodeStateAsUpdate(phone.doc!));
  assert.equal(phone.toString(), "Monday. Went for a run. Felt good.");
  assert.equal(web.getText("body").toString(), "Monday. Went for a run. Felt good.");
});
