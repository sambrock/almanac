import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { HttpApiBuilder, HttpApiScalar } from "effect/http-api";
import { createServer } from "node:http";

import { Api } from "./Api.ts";
import { AppConfig } from "./config/AppConfig.ts";
import { AuthorizationLive } from "./features/auth/AuthorizationLive.ts";
import { AuthRoutes, BetterAuth } from "./features/auth/BetterAuth.ts";
import { HealthHandlers } from "./features/health/HealthHandlers.ts";
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
  Layer.provide([HealthHandlers, UsersHandlers]),
  Layer.provide(AuthorizationLive),
);

const DocsLive = HttpApiScalar.layer(Api, { path: "/docs" });

// Layers further down are built first, so migrations finish before the
// server starts listening.
export const AppLayer = HttpRouter.serve(Layer.mergeAll(ApiLive, AuthRoutes, DocsLive)).pipe(
  Layer.provide(BetterAuth.layer),
  Layer.provide(Mailer.layerLog),
  Layer.provide(HttpServerLive),
  Layer.provide(DatabaseLive),
  Layer.provide(AppConfig.layer),
);
