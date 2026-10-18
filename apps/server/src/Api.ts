import { HttpApi, OpenApi } from "effect/http-api";

import { HealthApi } from "./features/health/HealthApi.ts";
import { JournalApi } from "./features/journal/JournalApi.ts";
import { UsersApi } from "./features/users/UsersApi.ts";

export class Api extends HttpApi.make("api")
  .add(HealthApi)
  .add(UsersApi)
  .add(JournalApi)
  .annotate(OpenApi.Title, "Almanac API") {}
