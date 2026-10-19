# server/ guidelines

Loaded when working in `server/`.

- **PartyServer, not raw Durable Objects.** `GameRoom` and `Matchmaker` extend partyserver's `Server` (a Durable Object underneath), routed by `routePartykitRequest` in `src/index.ts`. The `durable-objects` skill is written for raw Durable Objects: its storage, alarm, and "persist before caching in memory" advice applies here, but where it conflicts with PartyServer's patterns (RPC methods instead of `fetch()`, `getByName` stubs, `@cloudflare/vitest-pool-workers` tests), follow PartyServer and the existing code. Room tests run under plain Vitest with `FakeServer` from `src/testing/fakes.ts`.
