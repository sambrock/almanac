import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

import { Api } from "../../Api.ts";

export const HealthHandlers = HttpApiBuilder.group(Api, "health", (handlers) =>
  handlers.handle("check", () => Effect.succeed({ status: "ok" })),
);
