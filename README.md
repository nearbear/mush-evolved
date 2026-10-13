# mush2

A turn-based, browser-based social deduction game inspired by [Mush](https://github.com/motion-twin/WebGamesArchives) (Motion Twin) and [eMush](https://emush.eternaltwin.org/) (Eternaltwin). Players wake up on a spaceship, a few of them are secretly infected, and the rest have to survive and unmask them.

This is a **vertical-slice MVP**, not a full clone: matchmaking, bot fill, a room-by-room ship, action points, inventory, and chat work today. Infection and win conditions are deliberately **not implemented yet**; the rules haven't been decided. There is no hosted game: deployment has never been run, and the bot model API isn't chosen. You run it locally.

## Quick start

Requires **Node 24+**. On Windows, work inside WSL2. If you installed Node with nvm, run `source ~/.nvm/nvm.sh` first in non-interactive shells.

```bash
npm install
npm run dev
```

This starts both halves:

- **Game server** (wrangler, local Durable Objects): http://localhost:8787
- **Web client** (Vite): http://localhost:5173. Open this in a browser.

Enter a name and click **Find game**. After 5 seconds, empty seats fill with bots (labeled "(AI)"). To test with several humans, open more tabs within that window: each tab is a separate player.

Run the halves separately with `npm run dev -w server` and `npm run dev -w web`. To point the client at another server, copy `web/.env.example` to `web/.env` and set `VITE_PARTY_HOST`.

If `npm install` complains about blocked install scripts (npm 11), `esbuild` and `workerd` are already approved in the root `package.json`. A new package with an install script needs `npm install-scripts approve <pkg>`.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Vitest in `shared`, `tools`, and `web` |
| `npm test -w shared -- rules.test.ts -t "name"` | One file or test while iterating |
| `npm run typecheck` | `tsc --noEmit` in every package |
| `npm run lint` | Biome (lint only), including import-boundary rules |
| `npm run build` | Production build of the web client |
| `npm run ship-layout` | Regenerate ship data in `Mush/derived/` (a test fails if the committed files are stale) |
| `npm run asset-index` | Regenerate `Mush/derived/asset-index.txt` after adding or removing files in `Mush/` |
| `npm run screenshot` | Drive a running game in headless Chromium (desktop + 360px phone) and save screenshots to `.screenshots/` (needs `npm run dev`) |
| `npm run contact-sheet -- <folder>` | Render labeled contact sheets of an image folder |

## Project layout

npm workspaces:

- `shared/`: pure game rules, types, wire protocol. Deterministic TypeScript with no I/O. Rules run headless and are unit tested.
- `server/`: [PartyServer](https://github.com/cloudflare/partykit) on Cloudflare Durable Objects. `Matchmaker` (global queue, bot-fill timer) and `GameRoom` (one authoritative room per game), plus the bot interface.
- `web/`: React client (Vite, [Base UI](https://base-ui.com/)) that renders a per-player view and sends intents.
- `tools/`: build-time scripts (ship layout converter, screenshot and contact-sheet helpers).
- `Mush/`: Motion Twin's original sources and art (see License), exposed as the private package `@mush2/assets`.
- `docs/`: design notes. Start with [`docs/code-map.md`](docs/code-map.md) to find where things live and which rules exist, and [`docs/testing.md`](docs/testing.md) for what is and isn't covered.

## Architecture rules

Please read these before changing code; pull requests that break them will need rework.

1. **Server-authoritative.** The server holds the real state and sends each player a filtered `PlayerView`. Hidden information (roles, secret actions) must never reach a client that shouldn't see it. `viewFor` in `shared/src/rules.ts` is the one place it is stripped. Don't put hidden state in anything synced to all clients.
2. **Rules are pure code** in `shared`: no I/O, no network, seeded RNG, with tests.
3. **Thin view layer.** Components render a `PlayerView` and emit intents. The client never computes legality; it uses `view.legalActions`. See [`web/CLAUDE.md`](web/CLAUDE.md).
4. **Bots only get their own seat's view,** are labeled as AI, and call any model server-side only. Player chat is untrusted input.
5. **Mobile is first-class.** Every UI change must work in the tabbed phone layout (below 1024px, down to 360px wide) and on desktop.
6. **Every player-visible string is translatable** (en/fr/es). The seam is in; the comprehensive pass isn't.

## Contributing

- **How to contribute:** fork the repo, make your change on your fork, and open a pull request against `main` from it. For large changes, new dependencies, or anything touching the architecture rules, open an issue first to talk it over.
- **Game rules are not guessable.** If a rule is ambiguous (costs, visibility, win conditions), ask in an issue rather than inventing one. Rule changes go in `shared`, with tests, including checks that hidden information doesn't leak.
- Keep changes small and focused. Prefer the simplest thing that works for the vertical slice.
- Before opening a pull request, run `npm run typecheck`, `npm run lint`, and `npm test`.
- For UI changes, run `npm run screenshot` and check both the desktop and phone passes.
- Please don't add AI-generated non-text assets (art, sound) without discussing it first.
- Open items are tracked in [`docs/todo.md`](docs/todo.md), [`docs/next-steps.md`](docs/next-steps.md), and [`docs/plan.md`](docs/plan.md).

[`CLAUDE.md`](CLAUDE.md) holds the same project conventions for AI coding assistants; the project is developed with Claude Code, and [`docs/ai-workflow.md`](docs/ai-workflow.md) logs what worked and what didn't.

## Open decisions

Game name, player and Mush counts, roles, win conditions, cycle length, which hosted model API powers the bots, and hosting.

## License and credits

**Code:** MIT, see [`LICENSE`](LICENSE). It does not cover `Mush/`.

**Art and other assets in `Mush/`** are © Motion Twin, from [WebGamesArchives](https://github.com/motion-twin/WebGamesArchives), under **CC BY-NC-SA 4.0**: attribution required, non-commercial use only, and adaptations must be shared under the same license. See `Mush/LICENSE.txt`, `Mush/ATTRIBUTION.md`, and [`docs/mush-assets.md`](docs/mush-assets.md). Nothing built on them may be monetized.

Inspired by Mush (Motion Twin) and its open-source remake eMush (Eternaltwin). This project is not affiliated with either.
