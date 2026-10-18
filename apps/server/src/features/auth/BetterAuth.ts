import { betterAuth } from "better-auth";
import { bearer, emailOTP } from "better-auth/plugins";
import { Context, Effect, Layer, Redacted } from "effect";
import { HttpEffect, HttpRouter } from "effect/http";
import { Pool } from "pg";

import { AppConfig } from "../../config/AppConfig.ts";
import { Mailer } from "../../infra/Mailer.ts";

const makeAuth = (options: {
  pool: Pool;
  secret: string;
  baseURL: string;
  sendOtp: (email: string, otp: string) => void;
}) =>
  betterAuth({
    database: options.pool,
    secret: options.secret,
    baseURL: options.baseURL,
    plugins: [
      emailOTP({
        storeOTP: "hashed",
        // better-auth recommends not awaiting delivery so response timing
        // doesn't reveal whether the email has an account.
        sendVerificationOTP: async ({ email, otp }) => options.sendOtp(email, otp),
      }),
      bearer(),
    ],
  });

export class BetterAuth extends Context.Service<BetterAuth, ReturnType<typeof makeAuth>>()(
  "almanac/BetterAuth",
) {
  static readonly layer = Layer.effect(
    BetterAuth,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const mailer = yield* Mailer;
      const context = yield* Effect.context<never>();

      const pool = yield* Effect.acquireRelease(
        Effect.sync(() => new Pool({ connectionString: Redacted.value(config.databaseUrl) })),
        (pool) => Effect.promise(() => pool.end()),
      );

      return makeAuth({
        pool,
        secret: Redacted.value(config.betterAuthSecret),
        baseURL: config.betterAuthUrl,
        sendOtp: (email, otp) => {
          Effect.runForkWith(context)(mailer.sendOtp(email, otp));
        },
      });
    }),
  );
}

export const AuthRoutes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const auth = yield* BetterAuth;
    yield* router.add("*", "/api/auth/*", HttpEffect.fromWebHandler(auth.handler));
  }),
);
