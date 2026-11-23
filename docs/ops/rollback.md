# Rollback

How to roll back a bad deploy on `production`, `staging`, or `test` (#129). Every command below runs from `server/` unless noted; omit `--env` for production, or pass `--env staging` / `--env test`.

| Component | Reverts with `wrangler rollback`? | Notes |
| --- | --- | --- |
| Worker code & static assets (`web/dist`) | Yes | Bundled in the Worker version and reverted together. |
| Plain `vars` (`RULES_VERSION`, `ALLOW_CHEATS`) | Yes | Reverts to the target version's values. |
| Worker secrets (`config.md`) | No (kept) | Current secrets stay attached; a rollback fails if a secret the old version needed was deleted. |
| D1 schema & data (`d1-runbook.md`) | No | Usually left alone; use D1 Time Travel only when needed (see below). |
| Durable Object storage (`GameRoom`, `Matchmaker`) | No | Rooms restart on the older code and load their current snapshot. |
| R2 replay buckets (`r2.md`) | No | Finished-game replays only; normally untouched on rollback. |

## 1. Check before rolling back

List recent deployments and inspect the currently live version and the version you want to roll back to:

```sh
cd server
npx wrangler deployments list                 # add --env staging or --env test
npx wrangler versions view <version-id>       # check RULES_VERSION (the commit hash)
```

Before running `wrangler rollback`, check two things:

- **`STATE_VERSION` did not change** between the target version's `RULES_VERSION` and the currently deployed `RULES_VERSION` (`deploy.md`):

  ```sh
  git log -p -S STATE_VERSION -- shared/src/normalizeState.ts <target-commit>..<live-commit>
  ```

  If `STATE_VERSION` was bumped in the bad deploy, **do not roll back across it**: any room that already wrote a snapshot under the newer version will be refused as `UNAVAILABLE` by the older build until a newer build is deployed again. Fix forward instead. Logic changes and additive fields (no `STATE_VERSION` bump) roll back safely.
- **No new Durable Object migration** in `server/wrangler.jsonc` (`migrations`) was part of the deploy; `wrangler rollback` cannot cross a DO migration.

## 2. Roll back the Worker

From `server/`:

```sh
# Production
npx wrangler rollback -m "why we are rolling back"

# Staging
npx wrangler rollback --env staging -m "why we are rolling back"

# Test
npx wrangler rollback --env test -m "why we are rolling back"
```

By default, `wrangler rollback` targets the previous version and prompts for confirmation. To roll back further (up to the 10 most recent versions shown by `wrangler versions list`), pass the `<version-id>` explicitly:

```sh
npx wrangler rollback <version-id> --env staging -m "why we are rolling back"
```

Rolling back creates a new deployment pointing at the chosen version and restarts every running Durable Object room on that code. Connected players reconnect and any action under way or queued is dropped (players press again), the same as a normal deploy.

### If `wrangler rollback` cannot be used

If the last known-good build is older than the 10 versions wrangler retains, or a binding/config change blocks `wrangler rollback`, check out the known-good commit in a clean checkout (or temporary git worktree) and re-deploy from it with `npm run deploy:production` / `deploy:staging` / `deploy:test`. D1 skips migrations that are already recorded in `d1_migrations`.

## 3. D1: leave it alone unless data or schema broke

**In most bad deploys, do not roll back D1.** Migrations are append-only and expand-then-contract (`d1-runbook.md`), so adding a table, index, or nullable/defaulted column is safe to leave in place while the previous Worker runs. Leaving D1 alone preserves every account, session, rename, setup, and finished game written since the deploy, and avoids Durable Object drift.

**Roll back D1 only if** the bad deploy corrupted or deleted D1 rows, or shipped a non-backward-compatible migration that breaks the rolled-back Worker.

When you do need to roll back D1, use **D1 Time Travel** (`d1-runbook.md`) **after** rolling back the Worker (so the bad code stops writing):

1. Save the current bookmark first so the restore itself can be undone:

   ```sh
   cd server
   npx wrangler d1 time-travel info mush2-production   # or mush2-staging / mush2-test (+ --env)
   ```

2. Find the bookmark for a moment just before the bad deploy:

   ```sh
   npx wrangler d1 time-travel info mush2-production --timestamp="2026-11-22T17:30:00+00:00"
   ```

3. Restore to that bookmark (save the undo bookmark wrangler prints):

   ```sh
   npx wrangler d1 time-travel restore mush2-production --bookmark=<bookmark>
   ```

4. Account for the Durable Object drift documented in `d1-runbook.md` (`account_ships`, accounts/identities created after that timestamp, sessions, and renames). Restoring D1 also restores `d1_migrations` to that point, so the next deploy will re-apply any migrations after it.

## 4. Verify and follow up

1. Confirm the active deployment and `RULES_VERSION`:

   ```sh
   cd server # Use the appropriate command below

   npx wrangler deployments list --env test
   npx wrangler deployments list --env staging
   npx wrangler deployments list                 # production (top-level wrangler.jsonc config, no --env)
   ```

2. Watch logs for errors or `UNAVAILABLE` rooms (`observability.md`): check Workers Logs in the Cloudflare dashboard or run `npx wrangler tail` (with `--env` for staging/test).
3. Check running ships: `npm run ships -- --env <production|staging|test>`.
4. Smoke-test the deployment in a browser (client loads, lobby and game socket connect).
5. Revert or fix the bad commit on `main` so the next manual or CI deploy does not re-ship it.

