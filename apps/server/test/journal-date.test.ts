import { Schema } from "effect";
import assert from "node:assert/strict";
import test from "node:test";

import { JournalDate } from "../src/features/journal/JournalEntry.ts";

const isJournalDate = Schema.is(JournalDate);

test("journal dates accept real calendar days", () => {
  for (const date of ["2026-10-18", "2028-02-29", "0001-01-01", "9999-12-31"]) {
    assert.ok(isJournalDate(date), date);
  }
});

test("journal dates reject days Postgres can't store or that don't exist", () => {
  for (const date of ["0000-01-01", "2026-02-30", "2026-13-01", "2026-1-1", "2026-10-18T00:00"]) {
    assert.ok(!isJournalDate(date), date);
  }
});
