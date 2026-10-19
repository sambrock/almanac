import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic";
import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { Config, Effect, Layer } from "effect";
import { FetchHttpClient, HttpRouter } from "effect/http";
import { HttpApiBuilder, HttpApiScalar } from "effect/http-api";
import { createServer } from "node:http";

import { Api } from "./Api.ts";
import { AppConfig } from "./config/AppConfig.ts";
import { AuthorizationLive } from "./features/auth/AuthorizationLive.ts";
import { AuthRoutes, BetterAuth } from "./features/auth/BetterAuth.ts";
import { HealthHandlers } from "./features/health/HealthHandlers.ts";
import { JournalEntries } from "./features/journal/JournalEntries.ts";
import { JournalEntryTitlesLive } from "./features/journal/JournalEntryTitles.ts";
import { JournalHandlers } from "./features/journal/JournalHandlers.ts";
import { JournalRelay } from "./features/journal/JournalRelay.ts";
import { JournalSyncRoutes } from "./features/journal/JournalSync.ts";
import { UsersHandlers } from "./features/users/UsersHandlers.ts";
import { MigratorLive, PgLive } from "./infra/Database.ts";
import { Mailer } from "./infra/Mailer.ts";

const DatabaseLive = MigratorLive.pipe(
  Layer.provide(NodeServices.layer),
  Layer.provideMerge(PgLive),
);

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const { port } = yield* AppConfig;
    return NodeHttpServer.layer(createServer, { port });
  }),
);

const ApiLive = HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide([HealthHandlers, UsersHandlers, JournalHandlers]),
  Layer.provide(AuthorizationLive),
);

// Titles are short and easy, so the smallest model at low effort is enough.
const LanguageModelLive = AnthropicLanguageModel.layer({
  model: "claude-haiku-5-5",
  config: { max_tokens: 2048, output_config: { effort: "low" } },
}).pipe(
  Layer.provide(AnthropicClient.layerConfig({ apiKey: Config.Redacted("ANTHROPIC_API_KEY") })),
  Layer.provide(FetchHttpClient.layer),
);

const DocsLive = HttpApiScalar.layer(Api, { path: "/docs" });

const CorsLive = Layer.unwrap(
  Effect.gen(function* () {
    const { webOrigin } = yield* AppConfig;
    return HttpRouter.cors({ allowedOrigins: [webOrigin], credentials: true });
  }),
);

// Layers further down are built first, so migrations finish before the
// server starts listening.
export const AppLayer = Layer.mergeAll(
  HttpRouter.serve(Layer.mergeAll(ApiLive, AuthRoutes, JournalSyncRoutes, DocsLive, CorsLive)),
  JournalEntryTitlesLive,
).pipe(
  Layer.provide([JournalEntries.layer, JournalRelay.layer]),
  Layer.provide(LanguageModelLive),
  Layer.provide(BetterAuth.layer),
  Layer.provide(Mailer.layerLog),
  Layer.provide(HttpServerLive),
  Layer.provide(DatabaseLive),
  Layer.provide(AppConfig.layer),
);
