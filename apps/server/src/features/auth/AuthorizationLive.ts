import { Effect, Layer, Option } from "effect";
import { HttpServerRequest } from "effect/http";

import { Authorization, CurrentUser, Unauthorized } from "./Authorization.ts";
import { BetterAuth } from "./BetterAuth.ts";
import { sessionUser } from "./sessionUser.ts";

export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const auth = yield* BetterAuth;

    return Authorization.of((httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const user = yield* sessionUser(auth, new Headers(request.headers));
        if (Option.isNone(user)) {
          return yield* new Unauthorized({ message: "Not signed in" });
        }
        return yield* Effect.provideService(httpEffect, CurrentUser, user.value);
      }),
    );
  }),
);
