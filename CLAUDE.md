# CLAUDE.md

Project context for Claude Code. This file summarizes decisions made during planning so a fresh session can pick up where the design discussion left off. Items marked **(proposed)** or listed under "Open decisions" are not final; confirm with me before treating them as settled.

## What this project is

A turn-based, browser-based social deduction game inspired by **eMush**, the open-source remake (by the nonprofit Eternaltwin) of **Mush** by Motion Twin. In the original, players wake up on a spaceship (the Daedalus), a small number of them are infected "Mush," and the humans have to survive and unmask them. The original runs 16 players with 2 Mush, as asynchronous games lasting a few days.

This is a **vertical-slice MVP**, not a full clone. The goals are:

1. A playable end-to-end slice, public on the internet, with a plain per-language queue into a ship in its pre-selection phase (decided 2026-10-13, see `docs/rules-design.md`).
   - **Bots (2026-10-13):** multiplayer has no bots. AI-controlled bots exist only in a single-player mode (stage not decided) and as test tooling.
2. Demonstrate solid full-stack engineering and an AI-assisted development workflow (keep notes on what worked and what didn't; see "Working agreements").
3. Leave room to grow it into a real game later, including animated characters.

**Proposed slice scope:** 16 seats with 2 Mush (1 when 8 or fewer players are in the room; decided in `docs/rules-design.md`, not yet in the code), the 27-room Daedalus, the action-point loop and infection. Do not try to implement the full Mush ruleset.

## Stack

Decided:

- TypeScript everywhere; React for the web client, with Base UI (`@base-ui/react`, unstyled) for widgets like tabs and scroll areas.
- **PartyServer** (Cloudflare Durable Objects) for the realtime server, with custom authoritative rooms.
- **Basic DOM-rendered prototype first. No three.js yet.**
- Monorepo with `web`, `server`, and `shared` packages. Vite for the client; Vitest for tests.

Rejected (see `docs/ai-workflow.md`):

- **Yjs for game state.** It is a CRDT that syncs shared documents to every client, so anything in it is visible to everyone. Never put hidden information (roles, secret actions) in a Yjs document.
- **boardgame.io.** Requires a Node server rather than Cloudflare, and handling hidden information securely there adds complexity.

Dev environment: WSL2 (Ubuntu) on Windows, VS Code. Run installs, builds, and tests inside WSL.

## Architecture rules

These are non-negotiable unless I say otherwise.

1. **Server-authoritative.** The server holds the real state. Clients never receive hidden information. The server sends each player a filtered `PlayerView` computed for that player only.
2. **Rules are pure code.** Game rules live in the shared package as deterministic, side-effect-free TypeScript (seeded RNG, no I/O, no network), with unit tests. The rules must run headless.
3. **Thin view layer.** Components render a `PlayerView` and emit player intents; no game logic in components, and the renderer must stay swappable. Details in `web/CLAUDE.md`.
4. **Matchmaker is a separate global coordinator.** Game rooms don't know about each other. A matchmaker room holds waiting players, runs the fill-with-bots timer, and creates game rooms. (The code still works this way; the decided MVP model, a per-language matchmaker that points players at the open pre-selection ship, with no bots, is not built yet.)
5. **Bots sit behind one interface**, roughly `decideAction(view): Promise<Action>`:
   - A bot only ever receives the view its own seat would legitimately have.
   - Bots are clearly labeled as AI to players. Deliberate response delay is fine and is a pacing choice.
   - Model calls happen server-side only, with the base URL, model name, and API key in env/config. Start with a hosted, token-billed API (not Claude, since this is just the in-game AI); keep the interface compatible so I can later swap to a self-hosted model on NVIDIA Triton for learning.
   - Add rate limits and a hard spend cap.
   - Treat player chat as untrusted input to the model (prompt injection is expected).
6. **Public-internet basics:** basic abuse limits and chat moderation from the start.
7. **Mobile is first-class.** Every UI change must work in the tabbed phone layout (below 1024px) and on desktop. Details in `web/CLAUDE.md`.

## Assets and licensing

- Assets come from Motion Twin's [WebGamesArchives](https://github.com/motion-twin/WebGamesArchives) (the `Mush/` folder), licensed **CC BY-NC-SA 4.0** per that repo's root `LICENSE.txt`: attribution required, non-commercial only, adaptations must be shared under the same license. See `docs/mush-assets.md` for the inventory and licensing details.
- Keep assets in their own folder with the license text and an attribution file next to them. Do not mix them into the code tree.
- `Mush/package.json` makes the folder a private workspace package, `@mush2/assets`, whose `exports` allow only `derived/*`. Code packages import derived data by that name, never by a relative path out of their own package. (`web` still reaches art through relative `import.meta.glob` paths, which Vite needs.)
- Before using any asset, check that its folder isn't covered by different third-party terms (fonts, sounds, music especially).
- Code license is separate from the asset license: MIT (root `LICENSE`, chosen 2026-10-13; can be changed later while the user is the sole author). It does not cover `Mush/`.
- Do not monetize anything built on these assets.
- Check how the character art is delivered (sprite sheets, layered images, a skeletal rig). That determines how hard talking animations will be and whether a 2D renderer or three.js makes more sense later.

## Working agreements

- Plan before large changes and keep commits small and focused.
- Work lands directly on `main`; do not create or suggest feature branches or PRs. The one exception is git worktrees (for isolated work the user will check in a browser): a worktree needs a branch, so use a short-lived one made by Claude (`EnterWorktree`, or `git worktree add -b <name>`). When the user approves ("land it"), fast-forward or merge it into `main` from the main checkout, then remove the worktree and delete the branch. Never leave branches behind or push them. Worktrees start from committed `main`, so uncommitted changes in the main checkout are not in them. Run `npm install` once in a new worktree. `npm run dev` and `npm run screenshot` use per-worktree ports automatically (`npm run ports` shows them).
- Write tests for rules logic. Run typecheck and tests before saying something is done.
- Do not invent game rules. If a rule is ambiguous, ask me.
- Ask before adding dependencies.
- Prefer the simplest thing that works for the vertical slice, and flag scope creep.
- Keep a short log in `docs/ai-workflow.md` of significant decisions made with AI assistance, including what worked and what needed correction. I plan to write this up. Only ever append to it with `cat >>`; never read or rewrite the whole file (it is large).
- Run only the tests you need while iterating (`npm test -w shared -- rules.test.ts -t "name"`); run the full `npm test` and `npm run typecheck` once at the end.
- Explain tradeoffs when there is a real choice; I want to understand the code, not just receive it.
- Ignore the files in the `docs/scratchpad` folder unless otherwise directed; they are for notes and planning, not part of the main codebase.
- Do not use AI capabilities to generate any non-text assets or files without explicit approval.

## Build order

1. Scaffold the repo, CLAUDE.md, and tooling.
2. Rules as a pure state machine in `shared`, with tests.
3. Server: authoritative room wrapping the state machine, per-player views, then the matchmaker.
4. Plain DOM client, playable end to end even if ugly.
5. Bots behind the interface: scripted first, then the hosted model API.
6. Visuals: a renderer consuming the same views, then animations.
7. Deploy, write-up, README with a demo GIF.

## Commands

Node is installed via nvm. In non-interactive shells, run `source ~/.nvm/nvm.sh` first or `node`/`npm` won't be found.

- `npm install`: install all workspaces (npm workspaces: `shared`, `server`, `web`, `tools`, plus `Mush` as `@mush2/assets`).
- `npm run dev`: wrangler on :8787 plus Vite on :5173, via concurrently. In a git worktree the ports are offset per worktree (`npm run ports` prints them) so it can run beside the main checkout's servers.
- `npm test`: Vitest in `shared`, `tools`, and `web`. Single file or test: `npm test -w shared -- rules.test.ts -t "advances the cycle"`.
- `npm run typecheck`: `tsc --noEmit` in every package (TypeScript 7).
- `npm run build`: production build of `web`.
- `npm run ship-layout`: regenerate `Mush/derived/ship-layout.json` (renderer data) and `ship-rooms.json` (room graph and per-room equipment, for the rules) from `ShipMap.png` + `tiles.xml`. A test fails if the committed file is stale.
- `npm run asset-index`: regenerate `Mush/derived/asset-index.txt` (every file under `Mush/` with its size) after adding or removing files there. Search it to find assets by name; reading `Mush/www` and `Mush/clients` is denied.
- `npm run ods-data`: convert every sheet of `Mush/data/*.ods` (the original design tables: actions, items, diseases, explore, ...) to JSON under `Mush/derived/data/<file>/<sheet>.json`, so they can be grepped. Rerun after changing `Mush/data/`.
- `npm run screenshot`: drive the running game in headless Chromium (Playwright), as a desktop player and a 360px-wide phone player (the narrowest supported) in the same match, and save screenshots to `.screenshots/` (gitignored). `-- --only desktop|mobile` runs one pass. Needs `npm run dev` running. See the `play` skill.
- `npm run ship-view`: one screenshot of the iso view showing the whole ship (`--walk "Front corridor"` into a room first, `--clip x,y,w,h` and `--scale 3` to zoom), to `.screenshots/ship.png`. Needs `npm run dev`. See `web/src/iso/CLAUDE.md`.
- `npm run contact-sheet -- <folder> [--match regex] [--zoom n]`: render labeled contact sheets of an image folder to `.screenshots/contact/` (Playwright; WSL has no image tools). See the `asset` skill.
- `npm run types -w server`: regenerate `server/worker-configuration.d.ts` after changing `wrangler.jsonc` or the exported Durable Object classes.
- `npm run deploy -w server`: wrangler deploy (not yet configured or tested).
- `npm run lint`: Biome, lint only (formatter off). Rules: React hook deps/placement, floating promises (nursery), and import limits (`shared` has no I/O, UI, or sibling-package imports; `web` never imports `server`). typescript-eslint was rejected because it does not support TypeScript 7. Intentional exceptions use `biome-ignore` with a reason.

`docs/testing.md` lists what's important to test and why, with what's covered and what's missing.

Project skills in `.claude/skills/`: `play` (launch, drive, and look at the game), `rule` (adding or changing a game rule), `asset` (using art from `Mush/`), `bot` (scripted and model-backed bots), `leak-check` (review changes for hidden-information leaks), `i18n` (player-visible text and translations: en/fr/es), and `wrap-up` (verify, update docs, propose a commit).

npm 11 blocks dependency install scripts by default. `esbuild` and `workerd` are approved in the root `package.json` `allowScripts`; new packages with install scripts need `npm install-scripts approve <pkg>`.

## Code map

See `docs/code-map.md` (an index to per-package files in `docs/code-map/`) for where each module lives and `docs/implemented-rules.md` for which rules are implemented. Key invariants: `shared/src/rules.ts` is pure and `viewFor` is the only place hidden info is stripped; the client never computes legality (it uses `view.legalActions`); win conditions are intentionally absent until the rules are decided.

## Open decisions

Open work lives in **GitHub issues** in the [mush2 project](https://github.com/users/nearbear/projects/1): epics (label `epic`) with sub-issues, milestones for MVP, Private beta, Public beta readiness, Public beta, and Release, and `needs-staging` on issues without a stage yet. Open rule decisions carry the `rule-decision` label: `gh issue list --label rule-decision`. Search with `gh issue list --search "<keyword>"` and read one with `gh issue view <n>`. Answered rule decisions are recorded in `docs/rules-design.md` and `docs/action-plans.md`. The draft staging is `docs/mvp-plan.md` (not final). Do not treat anything in an issue as decided unless it is also recorded there as answered.

Not rules, but still open:

- Game name.
- Which stage single player (the only mode with bots) belongs in.
- Which hosted model API to use for single-player bots.
- Hosting and deployment details.
- Rendering beyond the DOM isometric view (decided: DOM for now, 2026-10-11).
- Internationalization (en/fr/es): the seam is in, the comprehensive pass is not.
