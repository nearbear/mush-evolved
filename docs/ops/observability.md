# Observability

What the server is doing and what went wrong, for the operator only (plan: `docs/plans/observability.md`, issue #127). Moderators never get dashboard access.

## Logs (#430)

Workers Logs is on for production, staging and test (`"observability"` in `server/wrangler.jsonc`), so logs are stored and searchable in the Cloudflare dashboard (Workers & Pages > the Worker > Logs), not only while `wrangler tail` runs.

- **Query strings are redacted** (`redact_query_string: true`). This is required: the game socket's URL carries the seat token (`?token=`, read in `GameRoom.onConnect`). Never turn it off. Confirmed on staging (2026-11-14): a game socket's invocation entry shows the URL without its query string.
- **Every line comes from `server/src/log.ts`**: `logWarn(event, fields)` and `logError(event, fields)` write one JSON object per line, `{ "level", "event", ...fields }`, which the dashboard stores as fields. Biome's `noConsole` rejects any other `console.*` in `server/src/`.
- **`event` is a fixed list** (`LogEvent` in `log.ts`): a name per failure, such as `tick_failed`, `replay_copy_failed` or `model_call_failed`. The comments in `log.ts` group them by module. `UNAVAILABLE` (level `error`) is a ship whose snapshot this build can't read (`deploy.md`).
- **`fields` takes only known safe keys** (`LogFields`): `roomId`, `language`, `seat`, `status`, `attempt`, `page`, `stateVersion`, `storedVersion`, `code`, `kind`, `errorName`, `message`. Anything else doesn't compile (`server/src/log.typecheck.ts`).

### What must never be logged

Game state (roles, items, rooms, what a seat knows or did), chat or any player text, names, account or session IDs, tokens, keys, IPs, model prompts or replies.

- **Rule errors log their code only** (`code: "illegal_action"`); a `code` that isn't a bare snake_case code is replaced with `not_a_code`.
- **Infrastructure failures** (D1, R2, an RPC) may log their message (`failure(e)`). A model call logs only our own `ModelError` messages and the HTTP status, otherwise just the error's name (`failureName(e)`): anything else could carry the request. Errors thrown by rules or bot code (`bot_failed`, `chat_router_failed`) log their name only too, so a future error message quoting state can't reach the log.
- **An unreadable snapshot** logs the error's name and its message up to the first `": "` (`snapshotFailure(e)`): a normalizer's message names the stored value after it.
- **No private channel ids**: a missing chat page logs its page number only.

Adding a key to `LogFields` is a leak-review change: run the `leak-check` skill.

### Invocation logs: on (owner, 2026-11-14)

Each request the Worker runs gets an automatic entry. Checked on staging: Cloudflare redacts the `cookie` and `sec-websocket-key` headers. It keeps the client's IP (`cf-connecting-ip`, `x-real-ip`), its city, postal code, rough coordinates, network, user agent and TLS fingerprints, for the log retention period. That is personal data (IPs count under GDPR), kept briefly for security and abuse. The privacy notice (Public beta readiness) must say so. If a future entry shows a cookie, an `Authorization` header or a `?token=` in a URL, turn invocation logs off (`"logs": { "invocation_logs": false }`) until it is fixed.

### Issues view: on, as a backstop (owner, 2026-11-14)

`"issues": { "enabled": true }` on all three deployments (Worker > Observability > Issues). Tried on test: it groups **uncaught exceptions only** (five throws became one issue with five events, message and stack), not our `logError` lines. So it catches crashes `log.ts` never sees, such as a bug in the request handler or the cron, and shows how often each happens and since which version. It is not the error tracker: almost every known failure is caught and logged as a line, so alerts (#432) search our `level: "error"` and `"warn"` lines in Workers Logs.

- An uncaught error's message and stack are stored unfiltered. Workers Logs stores the same text anyway, so Issues adds no new exposure, but no thrown message should quote game state.
- Not tried: whether a throw inside a Durable Object, or one PartyServer catches, appears there.

## Running ships (#431)

The `ships` table in D1 (`server/migrations/0005_ships.sql`, `server/src/shipStore.ts`) holds one row per ship running now: `room_id`, `language`, `single_player`, `seats`, `launched_at`. No player information.

- **Written at launch** by the room, without the game waiting on D1. A failed write logs `record_ship_failed` and is retried from the room's alarm with backoff; a room that restarts before the write was saved writes it again (idempotent). A ship that is already over by then writes nothing. Ships launched before this table existed write theirs on their next start.
- **Deleted when the game ends**, in the same D1 batch as its `games` row, so the table never holds a finished ship and needs no retention rule. A single-player game without an account has no `games` row; its ship row is deleted alone.
- **The daily cron** (`sweepRunning` in `shipSweep.ts`) asks each listed room whether it is still `running` and deletes the rows of those that aren't: retired by a `STATE_VERSION` bump, reclaimed, or crashed mid-launch. A room it can't ask keeps its row (`sweep_ask_failed`). A ship this build can't read (`UNAVAILABLE`) counts as running: a later build carries it on.

### `npm run ships -- --env <production|staging|test>`

Prints the running ships per language and mode, each with its room ID, signed-in players aboard (open `account_ships` rows) against seats, and launch time. It runs one fixed, read-only query through `wrangler d1 execute --remote` with your own wrangler login (`npx wrangler login`), so there is no web route to secure. It never prints account IDs or names.

- **Aboard counts signed-in players**: exact for multiplayer, which needs an account. Single player never boards, so it shows `-`.
- **A ship can be missing for a while** if its launch write failed: it appears once the room's retry succeeds.
- No cycle or phase yet (#434); a room ID is what to search for in the logs (`roomId`).
