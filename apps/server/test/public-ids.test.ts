import assert from "node:assert/strict";
import test from "node:test";

import { JournalEntryPublicId, makePublicId, UserPublicId } from "../src/domain/ids.ts";

test("generated public IDs are valid", () => {
  for (const schema of [UserPublicId, JournalEntryPublicId]) {
    for (let i = 0; i < 100; i++) {
      const id = makePublicId();
      assert.equal(schema.make(id), id);
    }
  }
});

test("public IDs reject invalid lengths and characters", () => {
  for (const schema of [UserPublicId, JournalEntryPublicId]) {
    for (const id of [
      "a".repeat(20),
      "a".repeat(22),
      "A".repeat(21),
      "_".repeat(21),
      "-".repeat(21),
      ".".repeat(21),
      " ".repeat(21),
    ]) {
      assert.throws(() => schema.make(id), /Schema validation failed/);
    }
  }
});
