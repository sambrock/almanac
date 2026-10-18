import { Context, Effect, Layer } from "effect";

export class Mailer extends Context.Service<
  Mailer,
  {
    sendOtp(email: string, otp: string): Effect.Effect<void>;
  }
>()("almanac/Mailer") {
  // Prints codes to the server log. Swap for a real provider before deploying.
  static readonly layerLog = Layer.succeed(
    Mailer,
    Mailer.of({
      sendOtp: Effect.fn("Mailer.sendOtp")(function* (email: string, otp: string) {
        yield* Effect.logInfo(`OTP for ${email}: ${otp}`);
      }),
    }),
  );
}
