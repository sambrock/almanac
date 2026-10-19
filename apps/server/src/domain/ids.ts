import { Schema } from "effect";
import { customAlphabet } from "nanoid";

export const UserId = Schema.Number.check(Schema.isInt32(), Schema.isGreaterThan(0)).pipe(
  Schema.brand("UserId"),
);
export type UserId = typeof UserId.Type;

export const makePublicId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 21);

const PublicId = Schema.String.check(Schema.isPattern(/^[a-z0-9]{21}$/));

export const UserPublicId = PublicId.pipe(Schema.brand("UserPublicId"));
export type UserPublicId = typeof UserPublicId.Type;

export const JournalEntryPublicId = PublicId.pipe(Schema.brand("JournalEntryPublicId"));
export type JournalEntryPublicId = typeof JournalEntryPublicId.Type;
