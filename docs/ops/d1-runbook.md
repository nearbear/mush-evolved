# D1: migrations and restores

Account storage (#282) lives in Cloudflare D1, one database per environment, bound as `DB` in `server/wrangler.jsonc`: `mush2-production`, `mush2-staging`, `mush2-test`. The schema is in `server/migrations/`; `server/src/accountStore.ts` and `server/src/setupStore.ts` (posted setups, #233) are the only code with SQL.

## Migrations

- `npm run deploy:production`, `deploy:staging` and `deploy:test` run `wrangler d1 migrations apply DB --remote` (with `--env` for staging and test) **before** `wrangler deploy`. A failed migration stops the deploy. Never apply migrations by hand. In a terminal wrangler asks for confirmation when there is something to apply; without a terminal (CI) it proceeds.
- `npm run dev` applies them to the local database (`server/.wrangler/state`) before starting wrangler.
- **Append-only.** Once on `main`, a file in `server/migrations/` is never edited, renamed or deleted. D1 records applied migrations by file name, so an edited file is never rerun anywhere it already ran. CI fails a push that changes one. Files are numbered `0001_`, `0002_`, ... with no gaps (a test checks), since wrangler applies them in name order.
- **Backward-compatible with the running Worker** (expand, then contract). Migrations run before the new code is deployed, and `wrangler rollback` reverts code, not schema. So a migration may add tables, columns (nullable or with a default) and indexes; a rename or drop waits for a later deploy, after no deployed version reads the old shape.
- `server/tests/accountStore.test.ts` applies every migration in order to a fresh database (node:sqlite); `accountStore.d1.test.ts` applies them with wrangler to a throwaway local D1 and runs each store statement once.

## Restoring a database (Time Travel)

D1 Time Travel restores a whole database to any minute in its retention window, in place. Cloudflare's docs (pricing, limits and Time Travel pages, read 2026-10-30): 7 days on Workers Free, 30 days on Workers Paid; no extra charge; at most 10 restores per 10 minutes per database.

```sh
cd server
# The bookmark for a moment (ISO time or Unix seconds); without --timestamp, the current one.
npx wrangler d1 time-travel info mush2-production --timestamp="2026-11-02T17:30:00+00:00"
# Overwrites the database. Prints a bookmark that undoes the restore: save it.
npx wrangler d1 time-travel restore mush2-production --timestamp=<unix seconds>   # or --bookmark=<bookmark>
```

Add `--env staging` or `--env test` with those databases' names. Take the current bookmark before restoring anything.

### What goes stale

Durable Object storage (every `GameRoom` and `Matchmaker`) is **not** rolled back with D1. After a restore to time T:

- **`account_ships`** reflects T, not the ships that exist now: accounts that boarded after T look free (and could board a second ship); accounts that died or whose ship ended after T look still aboard.
- **Sessions** created after T are gone, so those devices are signed out. Sessions deleted after T (sign-outs) are back until they expire.
- **Accounts** created after T are gone, and so are identities linked after T. Their seats in a `GameRoom` point at an account ID that no longer exists. Signing in again with the same provider creates a new account with a new ID, which does not match the seat.
- **Pending sign-ups** made after T are gone; those players sign in again.
- **Renames** after T are lost, along with their `name_history` rows; the old names are taken again.

### Repair

1. Rebuild the open `account_ships` rows: end every open row, then ask each live `GameRoom` for its seats' account IDs and board each one again. **Not built yet:** this needs a `GameRoom` RPC listing its seats' account IDs, and a list of live rooms, once seats carry account IDs (#285).
2. Seats whose account ID no longer exists: decide case by case (re-link the seat to the player's new account if they ask, or leave the character inactive). No tooling yet.
3. Nothing to repair for sessions or renames; tell affected players to sign in again or rename again.

## Deleting rows

Foreign keys are enforced (D1 always enforces them), and none cascades, by choice: what account deletion keeps (name history and moderation records especially) is a retention decision, #132. Until then, deleting an account means deleting its rows children first: `sessions`, `identities`, `name_history`, `account_ships`, then `accounts`, in one batch. Adding `ON DELETE CASCADE` later means rebuilding each child table in a migration, since SQLite can't alter a foreign key.

## Free-plan limits

From the same pages, read 2026-10-30. Workers Free: 5 million rows read and 100,000 rows written per day (queries fail until 00:00 UTC once either is hit), 5 GB total storage, 500 MB per database, 10 databases. Workers Paid: 25 billion rows read and 50 million written per month included (then $0.001 per million read, $1.00 per million written), 5 GB storage included (then $0.75 per GB-month), 10 GB per database. Rows read counts rows scanned, not rows returned, so lookups need their indexes.
