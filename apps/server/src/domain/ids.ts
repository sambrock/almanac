import { Schema } from "effect";

export const UserId = Schema.Number.check(Schema.isInt32(), Schema.isGreaterThan(0)).pipe(
  Schema.brand("UserId"),
);
export type UserId = typeof UserId.Type;

const PublicId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{21}$/));

export const UserPublicId = PublicId.pipe(Schema.brand("UserPublicId"));
export type UserPublicId = typeof UserPublicId.Type;

export const JournalEntryPublicId = PublicId.pipe(Schema.brand("JournalEntryPublicId"));
export type JournalEntryPublicId = typeof JournalEntryPublicId.Type;
