import { Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/http";

import { UserId } from "../../domain/ids.ts";
import { User } from "../users/User.ts";
import { Authorization, CurrentUser, Unauthorized } from "./Authorization.ts";
import { BetterAuth } from "./BetterAuth.ts";

export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const auth = yield* BetterAuth;

    return Authorization.of((httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const session = yield* Effect.promise(() =>
          auth.api.getSession({ headers: new Headers(request.headers) }),
        );
        if (session === null) {
          return yield* new Unauthorized({ message: "Not signed in" });
        }

        const { id, email, name, emailVerified } = session.user;
        return yield* Effect.provideService(
          httpEffect,
          CurrentUser,
          new User({ id: UserId.make(id), email, name, emailVerified }),
        );
      }),
    );
  }),
);
