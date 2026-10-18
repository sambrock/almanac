import { Schema } from "effect";

import { UserPublicId } from "../../domain/ids.ts";

export class User extends Schema.Class<User>("User")({
  id: UserPublicId,
  email: Schema.String,
  name: Schema.String,
  emailVerified: Schema.Boolean,
}) {}
