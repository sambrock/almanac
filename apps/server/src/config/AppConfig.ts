import { Config, Context, Layer, type Option, type Redacted } from "effect";

export class AppConfig extends Context.Service<
  AppConfig,
  {
    readonly port: number;
    readonly databaseUrl: Redacted.Redacted;
    readonly betterAuthSecret: Redacted.Redacted;
    readonly betterAuthUrl: string;
    readonly devOtpCode: Option.Option<string>;
  }
>()("almanac/AppConfig") {
  static readonly layer = Layer.effect(
    AppConfig,
    Config.all({
      port: Config.Port("PORT").pipe(Config.withDefault(3001)),
      databaseUrl: Config.Redacted("DATABASE_URL"),
      betterAuthSecret: Config.Redacted("BETTER_AUTH_SECRET"),
      betterAuthUrl: Config.String("BETTER_AUTH_URL"),
      devOtpCode: Config.String("DEV_OTP_CODE").pipe(Config.option),
    }),
  );
}
