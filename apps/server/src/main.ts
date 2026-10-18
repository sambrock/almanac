import { NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";

import { AppLayer } from "./AppLayer.ts";

NodeRuntime.runMain(Layer.launch(AppLayer));
