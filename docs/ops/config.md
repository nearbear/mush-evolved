# Configuration and secrets

Every variable the server reads. Secrets never go in the repo. Locally they live in `server/.dev.vars` (gitignored); on a deployment, `npx wrangler secret put <NAME> --env <staging|test>` run in `server/` (no `--env` for production). A deploy keeps them.

| Name | Kind | Where | Purpose |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Secret | Every deployment; `.dev.vars` if testing real sign-in locally | Google sign-in (`sign-in.md`). Without both, `/auth/google/start` answers 503. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Secret | Same | Discord sign-in. |
| `MODEL_API_KEY` | Secret | `.dev.vars` only, **never a deployment** | Dev key for model-backed bots with `DEV_SERVER`. Players bring their own key in single player (#216). |
| `MODEL_BASE_URL`, `MODEL_NAME`, `MODEL_BOTS` | Dev setting | `.dev.vars` only | OpenAI-compatible base URL, model name, and how many bots are model bots. |
| `DEV_SERVER` | Dev flag | Passed by `npm run dev`; never a deployment | Bot fill, looser rate limits, the dev model key. |
| `ALLOW_CHEATS` | Var | `wrangler.jsonc`: test and local dev only | Cheats, End cycle, `/api/docs`. |
| `ADMIN_TOKEN` | Secret | Only where you want `/admin/` routes (set by `npm run retire-ships -- --env <env> --init`; `.dev.vars` for dev) | Bearer token for `POST /admin/retire-ships`. Unset: no `/admin/` routes (404). |
| `CYCLE_SECONDS` | Var | Optional, dev | Overrides the cycle length (`server/src/cycleClock.ts`). |
| `RULES_VERSION` | Var | `wrangler.jsonc`; deploy scripts set the commit hash | Stored in each game's replay record. |

CI separately needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as secrets on the `test` GitHub environment (`deploy.md`). The rate limit bindings (`AUTH_LIMIT`, `SIGNUP_LIMIT`, `SETUP_POST_LIMIT`) are config in `wrangler.jsonc`, not secrets.

Use a separate OAuth app per provider for production; test, staging and local development may share one, since none has real users.
