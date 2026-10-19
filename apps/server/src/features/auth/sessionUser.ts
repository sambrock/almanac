import { Effect, Option } from "effect";

import { UserId, UserPublicId } from "../../domain/ids.ts";
import { User } from "../users/User.ts";
import type { BetterAuth } from "./BetterAuth.ts";

// `userId` is the internal key for queries. `user` is what the app API returns.
export type SessionUser = { userId: UserId; user: User };

// Reads the better-auth session cookie or `Authorization: Bearer <token>`.
export const sessionUser = Effect.fnUntraced(function* (
  auth: BetterAuth["Service"],
  headers: Headers,
) {
  const session = yield* Effect.promise(() => auth.api.getSession({ headers }));
  if (session === null) return Option.none();

  const { id, publicId, email, name, emailVerified } = session.user;
  return Option.some({
    // Better Auth returns serial IDs as strings.
    userId: UserId.make(Number(id)),
    user: new User({ id: UserPublicId.make(publicId), email, name, emailVerified }),
  });
});
