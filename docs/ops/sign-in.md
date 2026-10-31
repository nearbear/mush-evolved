# Sign-in: OAuth apps, secrets and sessions

Google and Discord sign-in (#283) and display names (#284), in `server/src/auth.ts` (routes, cookies, sessions) and `server/src/oauth.ts` (each provider's URLs and profile). Written by hand, no dependency. The sign-in screen that uses them is #286 (`web/src/account/`, `web/src/lobby/Lobby.tsx`); joining a ship with an account is #285.

## Setting up the OAuth apps (owner)

Create one Google OAuth client (type "Web application", scopes `openid` and `profile`) and one Discord application (OAuth2, scope `identify`). Register these redirect URIs on both, one per environment:

| Environment | Redirect URIs |
| --- | --- |
| Local (main checkout only) | `http://localhost:5173/auth/google/callback`, `http://localhost:5173/auth/discord/callback` |
| Production | `https://mush2-server.nearbearnearbear.workers.dev/auth/<provider>/callback` |
| Staging | `https://mush2-server-staging.nearbearnearbear.workers.dev/auth/<provider>/callback` |
| Test | `https://mush2-server-test.nearbearnearbear.workers.dev/auth/<provider>/callback` |

The redirect URI is the page's origin plus `/auth/<provider>/callback`. Locally that is Vite's port, not wrangler's: Vite proxies `/auth`, `/api` and `/parties` to wrangler and keeps the Host header, so the client is on one origin as in production. Worktrees run on other ports, which aren't registered: they use dev sign-in (#287). Test is behind Cloudflare Access; the callbacks pass because the browser already has the Access cookie.

Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`. Locally in `server/.dev.vars`; on a deployment `npx wrangler secret put <NAME>` in `server/` (add `--env staging` or `--env test`). A provider without both is answered with 503 at `/auth/<provider>/start`. They never go in the repo.

## Flow

1. `GET /auth/<provider>/start` sets a 10-minute state cookie (a random `state`, a PKCE verifier for Google, and whether this is a link to the signed-in account) and redirects to the provider. `?link=1` adds the provider to the signed-in account instead of signing in.
2. `GET /auth/<provider>/callback` clears the state cookie and refuses a callback whose `state` doesn't match it, before contacting the provider. It trades the code for a token and reads the provider's user ID and name.
   - A known identity signs in (a new session; the old one on this device is deleted) and goes to `/`.
   - An unknown identity becomes a pending sign-up (D1 `signups`, one hour, cookie holding a random ID, only its hash stored) and goes to `/?auth=signup`. No account exists until the name is confirmed with `POST /api/signup`.
   - A link adds the identity, or is refused: `identity_taken` if another account has it (accounts are never merged), `provider_linked` if this account already has one from that provider (one Google and one Discord at most, owner 2026-10-30; a unique index on `identities (account_id, provider)`).
   - Signing in (not linking) first ends this device's pending sign-up, and for an unknown identity its session too, so a sign-up never sits beside a session and can't create a second account for whoever was signed in.
   - Other outcomes: `/?auth=denied` (cancelled at the provider), `/?auth=failed`, `/?auth=linked`.
3. `GET /api/me` (`MeResponse` in `shared/src/accounts.ts`): signed out, a pending sign-up with the suggested name (the provider's name if it passes `checkDisplayName` and is free, else null so the field starts empty), or the account (ID, display name, linked providers, when the next rename is allowed).
4. `POST /api/signup` and `POST /api/rename` take `{ "name": ... }` as JSON. Names go through `checkDisplayName` (whitespace folded, at most `MAX_NAME_LENGTH`, refused if name moderation would change it) and are unique ignoring case (`nameKey`; NFC normalization is #309). A rename is allowed 24 hours after the last one; the first at once. The same name is refused as `name_unchanged`; a change of case is a rename. The old name is free at once.
5. `POST /auth/logout` ends this device's session and any pending sign-up (row and cookie), so the next person on that browser can't finish someone else's sign-up. Only POST, so a link can't sign anyone out.

## Sessions and cookies

- Session: a random 32-byte ID in a cookie, stored as its SHA-256. 30 days; a request extends it only when less than 15 days remain, so most requests don't write. Expired sessions are refused on lookup.
- Cookies are `HttpOnly`, `SameSite=Lax`, `Path=/`. On a deployment they are `Secure` with the `__Host-` prefix (`__Host-mush2_session`, `__Host-mush2_oauth`, `__Host-mush2_signup`). On a dev server (`DEV_SERVER`) there is no HTTPS, and cookies ignore ports while each worktree has its own local D1, so the name carries the page's port instead (`mush2_session_5173`).
- Lax keeps cookies off cross-site POSTs; `/api/*` also only reads JSON bodies, and only with a `Content-Length` of at most 1 KB (16 KB for a setup post; checked before reading).
- A daily Cron Trigger (`triggers.crons` in `server/wrangler.jsonc`, the `scheduled` handler in `server/src/index.ts`) deletes expired sessions and sign-ups.
- Never log a cookie, the OAuth `code` or a token.

## Dev sign-in (#287)

`GET /auth/dev?name=<name>` signs the browser in to a test account with that name, made the first time, and redirects to `/`. Tooling uses it (`tools/src/play/devSignIn.ts`), since multiplayer needs an account. By hand, dev builds of the lobby have a name box (prefilled with the OS username) and a Dev sign-in button in the top-left corner (a GET form to this route). Two guards: `DEV_SERVER` (only `npm run dev` sets it, never a deployment; not `ALLOW_CHEATS`, which the test deployment has) and a `localhost` or `127.0.0.1` host. Anywhere else it is a 404. Its accounts have only a `dev` identity, keyed by the name, and it never signs in through a Google or Discord identity: a name a real account holds is refused (409). Worktrees use it instead of real OAuth, whose redirect URIs are registered only for the main checkout's ports.

## Accounts on ships (#285)

- The Matchmaker hashes the session cookie from the socket's upgrade request and checks it against D1 when the player joins. No account: `sign_in_required`. The seat takes the account's display name (the name at the time), not the name the client sent. Single player needs no account.
- `account_ships` keeps an account on one ship across every language. The row is written before the seat and closed again if the seat fails. If the account already has an open row, the Matchmaker asks that ship to `resume` it (a new seat token, from any device); if the ship says the account isn't aboard (the game ended, the ship was retired, they died), the row is closed and the player boards normally.
- `GameRoom` keeps each seat's account ID beside the game (`accounts` in its storage), never in `GameState`, the record or a view. It closes a dead player's row at once, and every row when the game ends.
- Each seat token remembers the session (its hash) it was handed to. Ending a session (logout, or another account signing in on the device; the same account signing in again keeps its games) revokes that session's tokens on the account's newest ship and closes their sockets (4001). The account stays aboard: signing in again, on any device, resumes the ship (the Matchmaker's `resume`). Logging out in game (the settings dialog's Account tab, #321) goes back to the main menu. A dead seat on an older ship keeps its token, which only shows the graveyard view (owner, 2026-10-30: acceptable).
- The daily cron sweeps open rows older than 10 minutes and closes those whose ship doesn't have the account aboard (`server/src/shipSweep.ts`).

## Rate limits (#305)

`handleAuth` checks two Workers rate-limiting bindings (`ratelimits` in `server/wrangler.jsonc`, one pair per environment) before a route runs:

- `AUTH_LIMIT`, 60 requests a minute, on every `/auth/*` and `/api/*` route except `/auth/logout` (logging out must always work) and `/auth/<provider>/callback` (it only follows a limited start, and a forged one fails on the state cookie before any D1 or provider request). A request with a valid session is counted per account (one D1 session read), so players sharing an address don't use up each other's limit; any other request is counted per address (`CF-Connecting-IP`).
- `SIGNUP_LIMIT`, 3 a minute per address, on `/api/signup` (new accounts).
- `SETUP_POST_LIMIT`, 3 a minute per account, on `POST /api/setups` (#233). A signed-out post isn't counted; the route refuses it.

Over the limit, a page navigation (`/auth/<provider>/start`, `/auth/dev`) redirects to `/?auth=rate_limited`, which the lobby shows as a translated message, since a bare 429 would show the browser's own error page. The `/api/*` routes answer 429 with `reason: "rate_limited"` and `Retry-After: 60`. A 429 from `/api/me` keeps the client's last known account state, shows the message, and asks again after `Retry-After`. A failing binding lets the request through. The binding's period is only 10 or 60 seconds, so there is no per-day cap on new accounts yet (#322). On a dev or test server (`DEV_SERVER` or `ALLOW_CHEATS`) requests are spread over 10 keys in turn, making the limits 10 times larger for everyone there; staging is unscaled.

Not built yet: a ban revoking a seat (#76, with inactivity, #145).
