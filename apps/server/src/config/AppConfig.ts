import { Config, Context, Layer, type Redacted } from "effect";

export class AppConfig extends Context.Service<
  AppConfig,
  {
    readonly port: number;
    readonly databaseUrl: Redacted.Redacted;
    readonly betterAuthSecret: Redacted.Redacted;
    readonly betterAuthUrl: string;
  }
>()("almanac/AppConfig") {
  static readonly layer = Layer.effect(
    AppConfig,
    Config.all({
      port: Config.Port("PORT").pipe(Config.withDefault(3001)),
      databaseUrl: Config.Redacted("DATABASE_URL"),
      betterAuthSecret: Config.Redacted("BETTER_AUTH_SECRET"),
      betterAuthUrl: Config.String("BETTER_AUTH_URL"),
    }),
  );
}
