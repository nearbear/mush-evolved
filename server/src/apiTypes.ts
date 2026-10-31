// The site API's type for the typed client in `web` (#324): `hc<ApiType>` there checks paths, bodies and responses
// against the routes in auth.ts. Types only: `web` reaches this through the `@mush2/server/api` export, which has
// declarations and no JavaScript, so no server code can reach the client bundle.
//
// `web` reads the declarations tsconfig.api.json emits into dist/api-types (`npm run api-types`), not this source: the
// server's source needs the Workers types (`Env`, D1), which would clash with the DOM types in `web`'s type check.

import type { api } from "./auth.ts";

export type ApiType = typeof api;
