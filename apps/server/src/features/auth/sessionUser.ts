import { Effect, Option } from "effect";

import { UserId, UserPublicId } from "../../domain/ids.ts";
import { User } from "../users/User.ts";
import type { BetterAuth } from "./BetterAuth.ts";

export type SessionUser = { id: UserId; user: User };

// Reads the better-auth session cookie or `Authorization: Bearer <token>`.
export const sessionUser = Effect.fnUntraced(function* (
  auth: BetterAuth["Service"],
  headers: Headers,
) {
  const session = yield* Effect.promise(() => auth.api.getSession({ headers }));
  if (session === null) return Option.none<SessionUser>();

  const { id, publicId, email, name, emailVerified } = session.user;
  // Better Auth returns serial IDs as strings. Keep that internal ID separate
  // from the public user returned by the app API.
  return Option.some<SessionUser>({
    id: UserId.make(Number(id)),
    user: new User({ id: UserPublicId.make(publicId), email, name, emailVerified }),
  });
});
