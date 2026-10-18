import { OpenApi } from "effect/http-api";

import { Api } from "./Api.ts";

console.log(JSON.stringify(OpenApi.fromApi(Api), null, 2));
