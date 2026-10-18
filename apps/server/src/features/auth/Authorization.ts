import { Context, Schema } from "effect";
import { HttpApiMiddleware } from "effect/http-api";

import type { SessionUser } from "./sessionUser.ts";

export class CurrentUser extends Context.Service<CurrentUser, SessionUser>()(
  "almanac/CurrentUser",
) {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

// Accepts either the better-auth session cookie or `Authorization: Bearer <token>`.
export class Authorization extends HttpApiMiddleware.Service<
  Authorization,
  { provides: CurrentUser }
>()("almanac/Authorization", { error: Unauthorized }) {}
