# mush2

A turn-based, browser-based social deduction game inspired by [Mush](https://github.com/motion-twin/WebGamesArchives) (Motion Twin) and [eMush](https://emush.eternaltwin.org/) (Eternaltwin). Players wake up on a spaceship, a few of them are secretly infected, and the rest have to survive and unmask them.

This is a **vertical-slice MVP**, not a full clone: matchmaking, a room-by-room ship, action points, inventory, infection, and chat work today. Win conditions are deliberately **not implemented yet**; some of the rules are decided in `docs/rules-design.md`, and the rest are open as GitHub issues. A test build is live at https://mush2-server.nearbearnearbear.workers.dev (one Cloudflare Worker serves the client and the game server; `npm run deploy`). The bot model API isn't chosen.

## Quick start

Requires **Node 24+**. On Windows, work inside WSL 1 or 2. If you installed Node with nvm, run `source ~/.nvm/nvm.sh` first in non-interactive shells.

```bash
npm install
npm run dev
```

This starts both halves:

- **Game server** (wrangler, local Durable Objects): http://localhost:8787
- **Web client** (Vite): http://localhost:5173. Open this in a browser.

Enter a name and click **Find game**. After 5 seconds, empty seats fill with bots (labeled "(AI)"). This is test scaffolding: the planned multiplayer queue has no bots, and bots are meant only for a single-player mode. To test with several humans, open more tabs within that window: each tab is a separate player.

Run the halves separately with `npm run dev -w server` and `npm run dev -w web`. To point the client at another server, copy `web/.env.example` to `web/.env` and set `VITE_PARTY_HOST`.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Vitest in `shared`, `tools`, and `web` |
| `npm test -w shared -- rules.test.ts -t "name"` | One file or test while iterating |
| `npm run typecheck` | `tsc --noEmit` in every package |
| `npm run lint` | Biome (lint only), including import-boundary rules |
| `npm run build` | Production build of the web client |
| `npm run preview` | Build the client and serve the production build beside the local server (stop `npm run dev` first) |
| `npm run deploy` | Build the client and deploy it with the server as one Cloudflare Worker (needs `npx -w server wrangler login`) |

## Project layout

npm workspaces:

- `shared/`: pure game rules, types, wire protocol. Deterministic TypeScript with no I/O. Rules run headless and are unit tested.
- `server/`: [PartyServer](https://github.com/cloudflare/partykit) on Cloudflare Durable Objects. `Matchmaker` (global queue, bot-fill timer) and `GameRoom` (one authoritative room per game), plus the bot interface.
- `web/`: React client (Vite, [Base UI](https://base-ui.com/), [PixiJS](https://pixijs.com/) for the isometric room) that renders a per-player view and sends intents.
- `tools/`: build-time scripts (ship layout converter, screenshot and contact-sheet helpers).
- `Mush/`: Motion Twin's original sources and art (see [License](#license)), exposed as the private package `@mush2/assets`.
- `docs/`: design notes. Start with [`docs/code-map.md`](docs/code-map.md) to find where things live, [`docs/implemented-rules.md`](docs/implemented-rules.md) for which rules exist, and [`docs/testing.md`](docs/testing.md) for what is and isn't covered.

## Architecture rules

Please read the architecture rules in [`CLAUDE.md`](CLAUDE.md) before changing code (server-authoritative state, pure rules, a thin view layer, mobile first); pull requests that break them will need rework.

## Contributing

- **How to contribute:** fork the repo, make your change on your fork, and open a pull request against `main` from it. For large changes, new dependencies, or anything touching the architecture rules, open an issue first to talk it over.
- **Game rules are not guessable.** If a rule is ambiguous (costs, visibility, win conditions), ask in an issue rather than inventing one. Rule changes go in `shared`, with tests, including checks that hidden information doesn't leak.
- Keep changes small and focused. Prefer the simplest thing that works for the vertical slice.
- Before opening a pull request, run `npm run typecheck`, `npm run lint`, and `npm test`.
- For UI changes, run `npm run screenshot` and check both the desktop and phone passes.
- Please don't add AI-generated non-text assets (art, sound) without discussing it first.
- Open items are tracked as GitHub issues in the [project board](https://github.com/users/nearbear/projects/1); open rule questions carry the [`rule-decision`](https://github.com/nearbear/mush2/issues?q=is%3Aopen+label%3Arule-decision) label. Answered ones are recorded in [`docs/rules-design.md`](docs/rules-design.md) and [`docs/action-plans.md`](docs/action-plans.md).

[`CLAUDE.md`](CLAUDE.md) holds the same project conventions for AI coding assistants; the project is developed with Claude Code, and [`docs/ai-workflow.md`](docs/ai-workflow.md) logs what worked and what didn't.

## License

Code is MIT ([`LICENSE`](LICENSE)). Everything under `Mush/` is Motion Twin's, licensed CC BY-NC-SA 4.0 ([`Mush/LICENSE.txt`](Mush/LICENSE.txt), attribution in [`Mush/ATTRIBUTION.md`](Mush/ATTRIBUTION.md)): non-commercial only, so nothing built on these assets may be monetized.
