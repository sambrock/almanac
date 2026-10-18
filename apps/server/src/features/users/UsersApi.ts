import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";

import { Authorization } from "../auth/Authorization.ts";
import { User } from "./User.ts";

export class UsersApi extends HttpApiGroup.make("users")
  .add(HttpApiEndpoint.get("me", "/me", { success: User }))
  .middleware(Authorization) {}
