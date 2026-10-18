import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter } from "effect/http";
import { HttpApiBuilder, HttpApiScalar } from "effect/http-api";
import { createServer } from "node:http";

import { Api } from "./Api.ts";

const HealthLive = HttpApiBuilder.group(Api, "health", (handlers) =>
  handlers.handle("check", () => Effect.succeed({ status: "ok" })),
);

const ApiLive = HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide(HealthLive),
);

const DocsLive = HttpApiScalar.layer(Api, { path: "/docs" });

const ServerLive = HttpRouter.serve(Layer.mergeAll(ApiLive, DocsLive)).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3001 })),
);

NodeRuntime.runMain(Layer.launch(ServerLive));
