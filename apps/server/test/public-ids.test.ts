import assert from "node:assert/strict";
import test from "node:test";

import { JournalEntryPublicId, UserPublicId } from "../src/domain/ids.ts";

test("public IDs accept the full NanoID alphabet", () => {
  for (const schema of [UserPublicId, JournalEntryPublicId]) {
    for (const id of ["a0123456789abcdefghij", "A_0123456789abcdefgh-"]) {
      assert.equal(schema.make(id), id);
    }
  }
});

test("public IDs reject invalid lengths and characters", () => {
  for (const schema of [UserPublicId, JournalEntryPublicId]) {
    for (const id of ["a".repeat(20), "a".repeat(22), ".".repeat(21), " ".repeat(21)]) {
      assert.throws(() => schema.make(id), /Schema validation failed/);
    }
  }
});
