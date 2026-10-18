import { Schema } from "effect";

import { UserId } from "../../domain/ids.ts";

export class User extends Schema.Class<User>("User")({
  id: UserId,
  email: Schema.String,
  name: Schema.String,
  emailVerified: Schema.Boolean,
}) {}
