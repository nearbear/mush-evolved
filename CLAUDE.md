# CLAUDE.md

Project context for Claude Code. This file summarizes decisions made during planning so a fresh session can pick up where the design discussion left off. Items marked **(proposed)** or listed under "Open decisions" are not final; confirm with me before treating them as settled.

## What this project is

**Mush: Evolved** (name decided 2026-11-22, [#43](https://github.com/nearbear/mush2/issues/43)) is a turn-based, browser-based social deduction game inspired by **eMush**, the open-source remake (by the nonprofit Eternaltwin) of **Mush** by Motion Twin. In the original, players wake up on a spaceship (the Daedalus), a small number of them are infected "Mush," and the humans have to survive and unmask them. The original runs 16 players with 2 Mush, as asynchronous games lasting a few days.

This is a **vertical slice**, not a full clone. The goals are:

1. A playable end-to-end slice, public on the internet, with a plain per-language queue into a ship in its pre-selection phase (decided 2026-10-13, see `docs/rules/rules-design.md`).
   - **Bots (2026-10-13):** multiplayer has no bots. AI-controlled bots exist only in a single-player mode (stage not decided) and as test tooling.
2. Demonstrate solid full-stack engineering and an AI-assisted development workflow (keep notes on what worked and what didn't; see "Working agreements").
3. Leave room to grow it into a real game later, including animated characters.

**Proposed slice scope:** 16 seats with 2 Mush (1 when 8 or fewer players are in the room; decided in `docs/rules/rules-design.md`; built; a ship's seat count is `config.preselection.seats`, 16 by default in `PRESELECTION`), the 27-room Daedalus, the action-point loop and infection. Do not try to implement the full Mush ruleset.

## Stack

Decided:

- TypeScript everywhere; React for the web client, with Base UI (`@base-ui/react`, unstyled) for widgets like tabs and scroll areas.
- **PartyServer** (Cloudflare Durable Objects) for the realtime server, with custom authoritative rooms.
- **PixiJS** (`pixi.js@8.22.0`, 2D WebGL) renders the iso view. The original DOM renderer stays in the tree, switched by `ROOM_RENDERER` in `web/src/rendererChoice.ts`. three.js is not planned.
- Monorepo with `web`, `server`, and `shared` packages. Vite for the client; Vitest for tests.

Rejected (see `docs/process/ai-workflow.md`):

- **Yjs for game state.** It is a CRDT that syncs shared documents to every client, so anything in it is visible to everyone. Never put hidden information (roles, secret actions) in a Yjs document.
- **boardgame.io.** Requires a Node server rather than Cloudflare, and handling hidden information securely there adds complexity.

Dev environment: WSL2 (Ubuntu) on Windows, VS Code. Run installs, builds, and tests inside WSL.

## Architecture rules

These are non-negotiable unless I say otherwise.

1. **Server-authoritative.** The server holds the real state. Clients never receive hidden information. The server sends each player a filtered `PlayerView` computed for that player only.
2. **Rules are pure code.** Game rules live in the shared package as deterministic, side-effect-free TypeScript (seeded RNG, no I/O, no network), with unit tests. The rules must run headless.
3. **Thin view layer.** Components render a `PlayerView` and emit player intents; no game logic in components, and the renderer must stay swappable. Details in `web/CLAUDE.md`.
4. **Matchmaker is a separate coordinator.** Game rooms don't know about each other. One matchmaker room per language boards each joiner onto that language's open ship, which is in pre-selection (`shared/src/preselection.ts`), and launches a new one when needed. Multiplayer has no bots.
5. **Bots sit behind one interface**, `Bot` in `server/src/bots.ts` (details in the `bot` skill):
   - A bot only ever receives the view its own seat would legitimately have.
   - Bots are clearly labeled as AI to players. Deliberate response delay is fine and is a pacing choice.
   - Model calls happen server-side only. Credentials come from env/config (a dev key only; there is no hosted default), or in single player from the player's own key (BYOK, #216): sent over the game socket, held only in memory while that player is connected, never in game state, the record, a view or a log, and only for a provider on the server's allowlist (no client-supplied URLs). Start with a hosted, token-billed API (not Claude, since this is just the in-game AI); keep the interface compatible so I can later swap to a self-hosted model on NVIDIA Triton for learning.
   - Add rate limits and a hard spend cap.
   - Treat player chat as untrusted input to the model (prompt injection is expected).
6. **Public-internet basics:** basic abuse limits and chat moderation from the start.
7. **Mobile is first-class.** Every UI change must work in the tabbed phone layout (below 1024px) and on desktop. Details in `web/CLAUDE.md`.

## Assets and licensing

- Assets come from Motion Twin's [WebGamesArchives](https://github.com/motion-twin/WebGamesArchives) (the `Mush/` folder), licensed **CC BY-NC-SA 4.0** per that repo's root `LICENSE.txt`: attribution required, non-commercial only, adaptations must be shared under the same license. See `docs/assets/mush-assets.md` for the inventory and licensing details.
- Keep assets in their own folder with the license text and an attribution file next to them. Do not mix them into the code tree.
- `Mush/package.json` makes the folder a private workspace package, `@mush2/assets`, whose `exports` allow only `derived/*`. Code packages import derived data by that name, never by a relative path out of their own package. (`web` still reaches art through relative `import.meta.glob` paths, which Vite needs.)
- Before using any asset, check that its folder isn't covered by different third-party terms (fonts, sounds, music especially).
- Code license is separate from the asset license: AGPL-3.0-or-later (root `LICENSE`, the plain GNU text so GitHub detects it; the `Mush/` exception and MIT history are in `NOTICE`). MIT up to and including commit `256d721`; AGPL after it (#275, agreed by both authors). It does not cover `Mush/`. Anyone who modifies and hosts the game must offer its users the source; the footer's source link (`web/src/hud/Credits.tsx`) is commented out until the repo is public. New contributors must agree to AGPL; a relicense needs every author's consent.
- Do not monetize anything built on these assets.
- Check how the character art is delivered (sprite sheets, layered images, a skeletal rig). That determines how hard talking animations will be in the 2D (PixiJS) renderer.

## Working agreements

- Plan before large changes and keep commits small and focused.
- Work lands directly on `main`; do not create or suggest feature branches or PRs. The one exception is git worktrees (for isolated work the user will check in a browser): a worktree needs a branch, so use a short-lived one made by Claude (`EnterWorktree`, or `git worktree add -b <name>`). When the user approves ("land it"), fast-forward or merge it into `main` from the main checkout, then remove the worktree and delete the branch. Never leave branches behind or push them. Worktrees start from committed `main`, so uncommitted changes in the main checkout are not in them. Run `npm install` once in a new worktree. `npm run dev` and `npm run screenshot` use per-worktree ports automatically (`npm run ports` shows them).
- Write tests for rules logic. Run `npm run verify` before saying something is done.
- Do not invent game rules. If a rule is ambiguous, ask me.
- Ask before adding dependencies.
- Prefer the simplest thing that works for the vertical slice, and flag scope creep.
- The databases are currently empty, so it's OK if something bumps the game version for now.
- Keep a short log in `docs/process/ai-workflow.md` of significant decisions made with AI assistance, including what worked and what needed correction. I plan to write this up. Only ever append to it with `cat >>`; never read or rewrite the whole file (it is large).
- Keep `docs/rules/changes-from-emush.md` up to date whenever a change adds, modifies, or removes an implemented difference from eMush (excluding features not yet built).
- **Checks and the log happen once, at the very end of a task.** While iterating, run only the tests you need (`npm test -w shared -- rules.test.ts -t "name"`), not the full suite, typecheck or lint after each step. When the whole task is done, run `npm run verify` once (plus `npm run build` if `web` changed) — or `npm run verify:web` for a `web`-only UI change — and append one `docs/process/ai-workflow.md` entry for the whole task, not one per sub-step. Rerun `verify` only if you edit code after it passed.
- **Other sessions may be editing this checkout.** If `verify` fails in a file this task didn't touch, don't investigate. Name the failing test in one line, say it looks like someone else's work, and stop.
- Explain tradeoffs when there is a real choice; I want to understand the code, not just receive it.
- When you mention a GitHub issue to me, always make it a clickable link to the issue, e.g. [#216](https://github.com/nearbear/mush2/issues/216). The `#216` shorthand is fine as link text, but it must point at the full URL so I can Ctrl+click it.
- Ignore the files in the `docs/scratchpad` folder unless otherwise directed; they are for notes and planning, not part of the main codebase.
- Do not use AI capabilities to generate any non-text assets or files without explicit approval.

## Commands

Node is on `PATH` via nvm (pinned in the user settings `env`); if `node` isn't found, run `source ~/.nvm/nvm.sh` and tell the user the pinned path is stale.

- `npm run dev`: wrangler plus Vite (per-worktree ports; `npm run ports`). Needed by `screenshot` and `a11y`.
- `npm test -w shared -- rules.test.ts -t "name"`: one file or test, while iterating.
- `npm run verify`: typecheck, lint and all tests in one call, quiet unless something fails. Run it once, at the very end.
- `npm run verify:web`: typecheck, lint, `web` tests and `build` in one call, for `web`-only UI changes.
- `npm run build`: production build of `web`, if `web` changed.
- `npm run dev-state`: the local dev game's state, read-only (`--path players.0` for a part; see the `dev-state` skill). Shows hidden info: debugging only.
- `npm run layout-query -- <regex>`: search `ship-art.json` and `ship-map.json` (reading them directly is denied).
- `npm run emush -- <check|find|outline|spec>`: clean-room query/spec tool for upstream eMush in `reference/emush` (reading `reference/**` directly is denied).

Everything else (deploys, `ship-layout`, `screenshot`, `a11y`, `model-trial`, `lint:md`, npm install-script approvals) is in `docs/process/commands.md`. Read it before running a command not listed here.

## External tools

**Google Antigravity CLI** (`agy`, a Gemini agent). Optional; use the `gemini` skill for second opinions on plans, second leak and fr/es reviews, and summarizing big files. Never give it a shell or pass `--dangerously-skip-permissions`; the skill has the read-only call recipe.

`docs/process/testing.md` lists what's important to test and why, with what's covered and what's missing.

Project skills in `.claude/skills/`: `play` (launch, drive, and look at the game), `rule` (adding or changing a game rule), `asset` (using art from `Mush/`), `bot` (scripted and model-backed bots), `bot-strategy` (why bots lose and whether a change helped: the survival harness loop), `leak-check` (review changes for hidden-information leaks), `i18n` (player-visible text and translations: en/fr/es), `wiki` (search and read eMushpedia, the eMush wiki in fr/en/es, with `npm run wiki`), `wiki-translate` (translate an eMushpedia page into another of its languages), `emush` (clean-room extraction from upstream PHP via `npm run emush`), `gemini` (ask the Gemini CLI, read-only), `dev-state` (read the local dev game's state), and `wrap-up` (verify, update docs, propose a commit).

## Code map

`docs/README.md` indexes every doc (rules, plans, code map, assets, ops, process). See `docs/code-map/README.md` (an index to per-package files in `docs/code-map/`) for where each module lives, `docs/rules/implemented-rules.md` for which rules are implemented, and `docs/rules/changes-from-emush.md` for implemented differences from eMush. Key invariants: `shared/src/rules.ts` is pure and `viewFor` is the only place hidden info is stripped; the client never computes legality (it uses `view.actions`, or `legalIn(view)` for the affordable ones); only the win conditions that are decided exist (`shared/src/victory.ts` and `hunters.ts`: return to Sol, all humans dead, ship destroyed).

## Open decisions

Open work lives in **GitHub issues** in the [mush2 project](https://github.com/users/nearbear/projects/1): epics (label `epic`) with sub-issues, milestones for Private beta, Public beta readiness, Public beta, and Release, and `needs-staging` on issues without a stage yet. Open rule decisions carry the `rule-decision` label: `gh issue list --label rule-decision`. Search with `gh issue list --search "<keyword>"` and read one with `gh issue view <n>`. Answered rule decisions are recorded in `docs/rules/rules-design.md` and `docs/plans/archive/action-plans.md`. Do not treat anything in an issue as decided unless it is also recorded there as answered.

Not rules, but still open:

- Which stage single player (the only mode with bots) belongs in.
- Single-player model bots: no hosted default for now (decided 2026-10-23, the owner won't pay for unlimited use); players bring their own key. The server side is built (#216: `setModel`/`clearModel`, single player only); the allowlist will be OpenRouter, Google Gemini and OpenAI (owner, 2026-10-24; only OpenRouter is built, the rest and each provider's request body are #217). The settings panel with an opt-in "remember the key" (#218) and key status (#220) are not built, so no client sends a key yet.
- Hosting and deployment details beyond the current setup (one Worker on `workers.dev`, the client as static assets; a custom domain for the name below is not set up yet).
- Internationalization (en/fr/es): the seam is in, the comprehensive pass is not.
