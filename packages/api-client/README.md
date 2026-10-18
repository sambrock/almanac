# API client

Hey API generates the Fetch client, response types, and TanStack Query options from the Effect API in `apps/server/src/Api.ts`.

Run `pnpm generate:api` from the repository root after changing the API. Generation exports `openapi.json` directly from the API definition, so it needs no running server or database. Commit the schema and generated `src` files together.

Import SDK functions and types from `@almanac/api-client`, or query options and keys from `@almanac/api-client/tanstack-query`. Pass the API's `baseUrl` and authentication options when calling the helpers. The web app uses `credentials: "include"` for its session cookie.

The web route loaders prefetch `/me`, journal previews, and the requested entry snapshot on the server. A request-scoped fetch function forwards the incoming session cookie without adding it to query keys or shared configuration. The router's QueryClient is created per request and hydrates the browser cache.

The journal route waits for its snapshot before rendering. Saved Markdown appears in the initial HTML, and the editor starts from the snapshot's Yjs state before connecting to live sync. Each route load refreshes the snapshot; the mounted editor then receives changes through Yjs. Sessions and previews stay fresh for 30 seconds, and editor changes invalidate previews.

The home route uses `ssr: "data-only"` to prefetch data while keeping its redirect to today's journal date in the browser. The journal route renders on the server, and its Today link becomes available after hydration.

Better Auth owns its authentication routes and client. Entry bodies sync through Yjs over WebSockets, as described in [journal sync](../../docs/journal-sync.md).
