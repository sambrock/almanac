import { Effect, Option } from "effect";

import { UserId } from "../../domain/ids.ts";
import { User } from "../users/User.ts";
import type { BetterAuth } from "./BetterAuth.ts";

// Reads the better-auth session cookie or `Authorization: Bearer <token>`.
export const sessionUser = Effect.fnUntraced(function* (
  auth: BetterAuth["Service"],
  headers: Headers,
) {
  const session = yield* Effect.promise(() => auth.api.getSession({ headers }));
  if (session === null) return Option.none<User>();

  const { id, email, name, emailVerified } = session.user;
  return Option.some(new User({ id: UserId.make(id), email, name, emailVerified }));
});
