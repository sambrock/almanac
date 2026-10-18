import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

import { Api } from "../../Api.ts";
import { CurrentUser } from "../auth/Authorization.ts";

export const UsersHandlers = HttpApiBuilder.group(Api, "users", (handlers) =>
  handlers.handle("me", () => Effect.map(CurrentUser, (current) => current.user)),
);
