import { betterAuth } from "better-auth";
import { bearer, emailOTP } from "better-auth/plugins";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { HttpEffect, HttpRouter } from "effect/http";
import { Pool } from "pg";

import { AppConfig } from "../../config/AppConfig.ts";
import { makePublicId } from "../../domain/ids.ts";
import { Mailer } from "../../infra/Mailer.ts";

const publicIdField = {
  type: "string",
  fieldName: "public_id",
  required: true,
  unique: true,
  input: false,
  defaultValue: () => makePublicId(),
} as const;

const makeAuth = (options: {
  pool: Pool;
  secret: string;
  baseURL: string;
  webOrigin: string;
  devOtpCode: string | undefined;
  sendOtp: (email: string, otp: string) => void;
}) =>
  betterAuth({
    database: options.pool,
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: [options.webOrigin],
    advanced: { database: { generateId: "serial" } },
    // Map better-auth's camelCase fields to snake_case columns. Plugins that
    // add columns need their own `schema` mapping.
    user: {
      additionalFields: { publicId: publicIdField },
      fields: {
        emailVerified: "email_verified",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    session: {
      additionalFields: { publicId: publicIdField },
      fields: {
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        userId: "user_id",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    account: {
      additionalFields: { publicId: publicIdField },
      fields: {
        accountId: "account_id",
        providerId: "provider_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    verification: {
      additionalFields: { publicId: publicIdField },
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    plugins: [
      emailOTP({
        storeOTP: "hashed",
        // Returning undefined falls back to better-auth's random code.
        generateOTP: () => options.devOtpCode,
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

      const devOtpCode = Option.getOrUndefined(config.devOtpCode);
      if (devOtpCode !== undefined) {
        yield* Effect.logWarning(`DEV_OTP_CODE is set: every OTP will be ${devOtpCode}`);
      }

      return makeAuth({
        pool,
        secret: Redacted.value(config.betterAuthSecret),
        baseURL: config.betterAuthUrl,
        webOrigin: config.webOrigin,
        devOtpCode,
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
