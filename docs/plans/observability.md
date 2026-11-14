# Plan: observability (written 2026-11-14)

What the server is doing right now and what went wrong, for the **operator** (the owner). Moderators get none of this directly; their list of running ships is a separate story that reads the same table. Issue [#127](https://github.com/nearbear/mush2/issues/127), under the DevOps epic ([#51](https://github.com/nearbear/mush2/issues/51)). Nothing here is built yet.

## Decisions (owner, 2026-11-14)

- **"Right now" only; no Analytics Engine.** History over time is the finished-games list ([#155](https://github.com/nearbear/mush2/issues/155)) and replays ([#336](https://github.com/nearbear/mush2/issues/336)).
- **Running ships are D1 rows**, one per ship, written at launch and removed at the end. Until now nothing listed them: the Matchmaker forgets a ship once it stops boarding, and `games` only gets a row when a game ends.
- **Logs and Cloudflare metrics are operator-only.** Moderators never get dashboard access.
- **"Queue length" is dropped.** There has been no queue since 2026-10-13: a player boards the language's open ship directly. The nearest measure is how many players are aboard each ship.

## Stories

| Story | What | Stage |
|---|---|---|
| [#430](https://github.com/nearbear/mush2/issues/430) | Steps 1–3: stored, structured logs without secrets or hidden information | Private beta |
| [#431](https://github.com/nearbear/mush2/issues/431) | Steps 4–6: the running-ships table and `npm run ships` | Private beta |
| [#432](https://github.com/nearbear/mush2/issues/432) | Alerts on error spikes | Private beta |
| [#433](https://github.com/nearbear/mush2/issues/433) | Moderator list of running ships (Moderation epic, [#48](https://github.com/nearbear/mush2/issues/48)) | Private beta |
| [#434](https://github.com/nearbear/mush2/issues/434) | Phase and cycle in the running-ships list, in both lists | Not staged |

## Steps 1–3: logs ([#430](https://github.com/nearbear/mush2/issues/430))

- **Step 1: Workers Logs on.** `"observability": { "enabled": true, "redact_query_string": true }` in `server/wrangler.jsonc`, in production, staging and test. The redaction is required: the game socket's URL carries the seat token (`?token=`, read in `GameRoom.onConnect`), and without it every connection would store a working credential. Fix the stale comment there that says test is behind Cloudflare Access (public since 2026-11-08, `docs/ops/deploy.md`).
  - On staging, with the owner, open one automatic invocation log entry. If it records IPs, cookies or other headers, set `invocation_logs: false` and rely on our own lines plus the dashboard's request graphs.
  - Try the `issues` setting (Cloudflare's error grouping, in wrangler 4.145's schema) as the error tracker before any third-party service, which would be a new dependency.
- **Step 2: `server/src/log.ts`.** `logWarn(event, fields)` and `logError(event, fields)` write one JSON line each. `event` is a fixed union of names (`"tick_failed"`, `"replay_copy_failed"`, ...); `fields` takes only known safe keys (`roomId`, `language`, `seat`, `status`, `attempt`, `errorName`), so passing state, chat, names or an account ID doesn't compile.
- **Step 3: convert the existing lines.** About 28 `console.warn`/`console.error` calls in Matchmaker, GameRoom, model, auth and shipSweep. Infrastructure failures (D1, R2, a model call) may log their message. Rule errors log their code only: the bot illegal-action line can describe hidden state today. The `UNAVAILABLE` line keeps its level and prefix (`deploy.md` tells the operator to search for it). Run the `leak-check` skill on the result.

## Steps 4–6: running ships ([#431](https://github.com/nearbear/mush2/issues/431))

- **Step 4: `server/migrations/0005_ships.sql` and `server/src/shipStore.ts`.** A `ships` table of running ships only: `room_id`, `language`, `single_player`, `seats`, `launched_at`.
  - Written at launch (`GameRoom.launch`). Not atomic with the room's storage, so idempotent and retried from the room's alarm, like `recordFinished`. The game never waits on D1. A retry for a game that has already ended writes nothing.
  - Deleted when the game ends, in the same D1 batch as its `games` row, so the table never holds a finished ship and needs no retention rule ([#132](https://github.com/nearbear/mush2/issues/132)).
  - A single-player game without an account gets a row too (it is load), with no player information, deleted the same way.
  - The daily sweep (`shipSweep.ts`) removes rows for ships that never end (retired by a `STATE_VERSION` bump, a crash mid-launch), after asking the room through a small new RPC whether it is still running.
- **Step 5: `npm run ships -- --env <production|staging|test>`** in `tools/`. A fixed, read-only query through `wrangler d1 execute --remote`, with the operator's own wrangler login: running ships per language and mode, signed-in players aboard each (open `account_ships` rows) against seats, launch time. No new web route, so nothing new to secure; no account IDs or names printed.
- **Step 6: docs.** A new `observability.md` in `docs/ops/`: where the logs are in the dashboard, what each event means, `npm run ships`, and what must never be logged. Links from `deploy.md`, the code map and `commands.md`.

## Tradeoffs

- **A failed launch write** leaves the ship off the list until the alarm retry succeeds.
- **Players aboard counts signed-in players.** Exact for multiplayer, which needs an account; single player shows 1 or 0.
- **No cycle or phase** in the first table: that is a D1 write per ship per cycle. Launch time is enough for "right now"; [#434](https://github.com/nearbear/mush2/issues/434) adds them.
- **No version bumps.** The room snapshot and the rules don't change, so neither `STATE_VERSION` nor `RULES_VERSION` moves. No new npm dependency.
- Steps 1–3 and 4–6 are separate commits and can land in either order.

## Open questions

- Invocation logs on or off, and Cloudflare's Issues view as the error tracker: decided on staging with the owner ([#430](https://github.com/nearbear/mush2/issues/430)).
- Where alerts go and what counts as a spike ([#432](https://github.com/nearbear/mush2/issues/432)).
- How a moderator is identified: no moderator role exists yet. [#433](https://github.com/nearbear/mush2/issues/433) depends on staff roles ([#352](https://github.com/nearbear/mush2/issues/352), not staged), unless a minimal role is brought forward. Its other questions (page or API, languages, a moderator's own ship) are in the issue.
- A write per cycle, or only on phase changes ([#434](https://github.com/nearbear/mush2/issues/434)).
