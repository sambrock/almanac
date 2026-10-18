import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

export class HealthApi extends HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("check", "/health", {
    success: Schema.Struct({ status: Schema.Literal("ok") }),
  }),
) {}
