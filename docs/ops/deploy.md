# Deploys

Three Workers, each with the client as static assets and its own D1 database, R2 bucket for replays (`r2.md`; create the buckets before deploying) and Durable Object storage (`server/wrangler.jsonc`):

| Target | Worker | How it deploys |
| --- | --- | --- |
| Test | `mush2-server-test`, cheats on, public (not behind Cloudflare Access, by choice, 2026-11-08) | From CI, by a manual trigger (#121), or by hand: `npm run deploy:test` |
| Staging | `mush2-server-staging` | By hand: `npm run deploy:staging` |
| Production | `mush2-server` | By hand: `npm run deploy:production` |

Every deploy, by hand or from CI, runs the same script: build `web`, apply that environment's D1 migrations, then `wrangler deploy` with `RULES_VERSION` set to the commit hash (see `d1-runbook.md` for why migrations go first and must stay backward-compatible).

## Live games across deploys (`STATE_VERSION`)

Games in progress survive a deploy (#384): on start, each room runs its stored snapshot through the upgrade steps it still needs and the normalizers (`shared/src/normalizeState.ts`), then continues. Rule changes and additive shape changes (a new field with a default) never change `STATE_VERSION`. A breaking shape change (a removed or renamed field or registry id) adds an upgrade step and bumps it. A field or id that never reached a deploy (test or production) is in no stored snapshot, so changing or removing it needs no step. It never reached a deploy if, for each environment, `git merge-base --is-ancestor <commit that added it> <RULES_VERSION>` exits non-zero.

- **Roll back only to a build with the same `STATE_VERSION`.** An older build reads an additive deploy's snapshots fine (it drops the keys it doesn't know), so logic and additive deploys roll back freely. A snapshot written after a step is above an older build's version: that build keeps it but can't read it, so the ship is unavailable until a build that reads it is deployed again.
- **A breaking step lands in a deploy of its own**, not bundled with rule changes you might want to undo, so undoing those never means rolling back across the step. Check with `git log -p -S STATE_VERSION -- shared/src/normalizeState.ts` between the deployed commit (`RULES_VERSION`) and the one going out.
- **An unreadable snapshot is kept, never deleted.** If the normalizers reject one, or it is newer than the build, the room logs an `UNAVAILABLE` event at level `error` (`observability.md`; search the Worker's logs or `wrangler tail` for it), refuses players with "Ship unavailable", and changes nothing. The fix is forward: deploy a build whose normalizer or step reads it, and the room loads it on its next start.
- **Ending every live game on purpose** means raising `MIN_STATE_VERSION`: older snapshots are then dropped on start, their records kept for the replay. The owner decides that.

## Deploying to test from CI

The `deploy-test` job in `.github/workflows/ci.yml` runs `npm run deploy:test` after the `check` job passes, but only when someone starts it: Actions tab > CI > Run workflow on `main` with **Deploy to test** ticked, or

```sh
gh workflow run CI -f deploy_test=true
```

It runs only on `main` in `nearbear/mush2`, not on forks or other branches. Compared with a deploy from a laptop it builds from a clean checkout, deploys only a commit whose checks passed, and keeps the Cloudflare token off your machine.

- **Why not on every push.** A deploy restarts every game room (everyone reconnects, and any action under way or queued is dropped, so players press again) and runs the new rules under games in progress. Stored games carry over (#384): each room normalizes its snapshot on load. Deploy when nobody is mid-test, or when you mean to.
- **One at a time.** Deploys share a concurrency group that never cancels a running deploy, and a newer waiting deploy replaces an older waiting one. A push to `main` never cancels a manual run's checks.
- **Failure.** A failed migration stops the deploy before the Worker is uploaded, so the previous version keeps running. Roll back code with `npx wrangler rollback --env test` in `server/` (code only, not schema).

### Setup (once)

The job reads two secrets from the `test` GitHub environment. Until they are set, a deploy run fails with an error naming them; plain pushes never need them.

1. In the Cloudflare dashboard, create an API token (My Profile > API Tokens > Custom token) with **Account > Workers Scripts: Edit**, **Account > D1: Edit** and **Account > Workers R2 Storage: Edit** (`r2.md`) on this account only. Nothing else: the job never touches Access, DNS or other Workers' settings.
2. Create the environment and set the secrets:

   ```sh
   gh api -X PUT repos/nearbear/mush2/environments/test
   gh secret set CLOUDFLARE_API_TOKEN --env test
   gh secret set CLOUDFLARE_ACCOUNT_ID --env test
   ```

   The account ID is on the Workers overview page in the dashboard, or `npx wrangler whoami`.
3. Optionally, in the repo's Settings > Environments > test, limit deployment branches to `main`.

Worker secrets (OAuth client IDs and secrets, `docs/ops/sign-in.md`) live on the Worker, not in GitHub, and a deploy keeps them.
