# Deploys

Three Workers, each with the client as static assets and its own D1 database and Durable Object storage (`server/wrangler.jsonc`):

| Target | Worker | How it deploys |
| --- | --- | --- |
| Test | `mush2-server-test`, behind Cloudflare Access, cheats on | From CI, by a manual trigger (#121), or by hand: `npm run deploy:test` |
| Staging | `mush2-server-staging` | By hand: `npm run deploy:staging` |
| Production | `mush2-server` | By hand: `npm run deploy:production` |

Every deploy, by hand or from CI, runs the same script: build `web`, apply that environment's D1 migrations, then `wrangler deploy` with `RULES_VERSION` set to the commit hash (see `d1-runbook.md` for why migrations go first and must stay backward-compatible).

## Deploying to test from CI

The `deploy-test` job in `.github/workflows/ci.yml` runs `npm run deploy:test` after the `check` job passes, but only when someone starts it: Actions tab > CI > Run workflow on `main` with **Deploy to test** ticked, or

```sh
gh workflow run CI -f deploy_test=true
```

It runs only on `main` in `nearbear/mush2`, not on forks or other branches. Compared with a deploy from a laptop it builds from a clean checkout, deploys only a commit whose checks passed, and keeps the Cloudflare token off your machine.

- **Why not on every push.** A deploy restarts every game room (everyone reconnects), runs the new rules under games in progress, and a `STATE_VERSION` bump retires every running game. State bumps land a few times a day, so deploying every push would end testers' games at moments nobody chose. Deploy when nobody is mid-test, or when you mean to.
- **One at a time.** Deploys share a concurrency group that never cancels a running deploy, and a newer waiting deploy replaces an older waiting one. A push to `main` never cancels a manual run's checks.
- **Failure.** A failed migration stops the deploy before the Worker is uploaded, so the previous version keeps running. Roll back code with `npx wrangler rollback --env test` in `server/` (code only, not schema).

### Setup (once)

The job reads two secrets from the `test` GitHub environment. Until they are set, a deploy run fails with an error naming them; plain pushes never need them.

1. In the Cloudflare dashboard, create an API token (My Profile > API Tokens > Custom token) with **Account > Workers Scripts: Edit** and **Account > D1: Edit** on this account only. Nothing else: the job never touches Access, DNS or other Workers' settings.
2. Create the environment and set the secrets:

   ```sh
   gh api -X PUT repos/nearbear/mush2/environments/test
   gh secret set CLOUDFLARE_API_TOKEN --env test
   gh secret set CLOUDFLARE_ACCOUNT_ID --env test
   ```

   The account ID is on the Workers overview page in the dashboard, or `npx wrangler whoami`.
3. Optionally, in the repo's Settings > Environments > test, limit deployment branches to `main`.

Worker secrets (OAuth client IDs and secrets, `docs/ops/sign-in.md`) live on the Worker, not in GitHub, and a deploy keeps them.
