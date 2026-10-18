import { HttpApi, OpenApi } from "effect/http-api";

import { HealthApi } from "./features/health/HealthApi.ts";
import { UsersApi } from "./features/users/UsersApi.ts";

export class Api extends HttpApi.make("api")
  .add(HealthApi)
  .add(UsersApi)
  .annotate(OpenApi.Title, "Almanac API") {}
