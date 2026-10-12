# CLAUDE.md

Project context for Claude Code. This file summarizes decisions made during planning so a fresh session can pick up where the design discussion left off. Items marked **(proposed)** or listed under "Open decisions" are not final; confirm with me before treating them as settled.

## What this project is

A turn-based, browser-based social deduction game inspired by **eMush**, the open-source remake (by the nonprofit Eternaltwin) of **Mush** by Motion Twin. In the original, players wake up on a spaceship (the Daedalus), a small number of them are infected "Mush," and the humans have to survive and unmask them. The original runs 16 players with 2 Mush, as asynchronous games lasting a few days.

This is a **vertical-slice MVP**, not a full clone. The goals are:

1. A playable end-to-end slice, public on the internet, with lobbies, a matchmaking queue, and AI-controlled bots that fill seats when the queue doesn't fill fast enough.
2. Demonstrate solid full-stack engineering and an AI-assisted development workflow (keep notes on what worked and what didn't; see "Working agreements").
3. Leave room to grow it into a real game later, including animated characters.

**Proposed slice scope:** about 8 players, a handful of rooms, the action-point loop, infection, and voting. Do not try to implement the full Mush ruleset.

## Stack

Decided:

- TypeScript everywhere; React for the web client, with Base UI (`@base-ui/react`, unstyled) for widgets like tabs and scroll areas.
- **PartyServer** (Cloudflare Durable Objects) for the realtime server, with custom authoritative rooms.
- **Basic DOM-rendered prototype first. No three.js yet.**
- Monorepo with `web`, `server`, and `shared` packages (the folders exist but are empty placeholders until scaffolding). Vite for the client; Vitest for tests.

Rejected (see `docs/ai-workflow.md`):

- **Yjs for game state.** It is a CRDT that syncs shared documents to every client, so anything in it is visible to everyone. Never put hidden information (roles, secret actions) in a Yjs document.
- **boardgame.io.** Requires a Node server rather than Cloudflare, and handling hidden information securely there adds complexity.

Dev environment: WSL2 (Ubuntu) on Windows, VS Code. Run installs, builds, and tests inside WSL.

## Architecture rules

These are non-negotiable unless I say otherwise.

1. **Server-authoritative.** The server holds the real state. Clients never receive hidden information. The server sends each player a filtered `PlayerView` computed for that player only.
2. **Rules are pure code.** Game rules live in the shared package as deterministic, side-effect-free TypeScript (seeded RNG, no I/O, no network), with unit tests. The rules must run headless.
3. **Thin view layer.** Components render a `PlayerView` and emit player intents. No game logic in components. The renderer must be swappable: DOM now, possibly react-three-fiber or something more experimental later. Keep chat and text input in the DOM regardless of renderer. I want to experiment with custom animated UI later, so do not couple rendering to game logic.
4. **Matchmaker is a separate global coordinator.** Game rooms don't know about each other. A matchmaker room holds waiting players, runs the fill-with-bots timer, and creates game rooms.
5. **Bots sit behind one interface**, roughly `decideAction(view): Promise<Action>`:
   - A bot only ever receives the view its own seat would legitimately have.
   - Bots are clearly labeled as AI to players. Deliberate response delay is fine and is a pacing choice.
   - Model calls happen server-side only, with the base URL, model name, and API key in env/config. Start with a hosted, token-billed API (not Claude, since this is just the in-game AI); keep the interface compatible so I can later swap to a self-hosted model on NVIDIA Triton for learning.
   - Add rate limits and a hard spend cap.
   - Treat player chat as untrusted input to the model (prompt injection is expected).
6. **Public-internet basics:** basic abuse limits and chat moderation from the start.

## Assets and licensing

- Assets come from Motion Twin's [WebGamesArchives](https://github.com/motion-twin/WebGamesArchives) (the `Mush/` folder), licensed **CC BY-NC-SA 4.0** per that repo's root `LICENSE.txt`: attribution required, non-commercial only, adaptations must be shared under the same license. See `docs/mush-assets.md` for the inventory and licensing details.
- Keep assets in their own folder with the license text and an attribution file next to them. Do not mix them into the code tree.
- Before using any asset, check that its folder isn't covered by different third-party terms (fonts, sounds, music especially).
- Code license is separate and undecided (MIT is the likely choice).
- Do not monetize anything built on these assets.
- Check how the character art is delivered (sprite sheets, layered images, a skeletal rig). That determines how hard talking animations will be and whether a 2D renderer or three.js makes more sense later.

## Working agreements

- Plan before large changes and keep commits small and focused.
- Write tests for rules logic. Run typecheck and tests before saying something is done.
- Do not invent game rules. If a rule is ambiguous, ask me.
- Ask before adding dependencies.
- Prefer the simplest thing that works for the vertical slice, and flag scope creep.
- Keep a short log in `docs/ai-workflow.md` of significant decisions made with AI assistance, including what worked and what needed correction. I plan to write this up.
- Explain tradeoffs when there is a real choice; I want to understand the code, not just receive it.
- Ignore the files in the `docs/scratchpad` folder unless otherwise directed; they are for notes and planning, not part of the main codebase.
- Do not generate any non-text assets or files without explicit approval.

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

- `npm install`: install all workspaces (npm workspaces: `shared`, `server`, `web`).
- `npm run dev`: wrangler on :8787 plus Vite on :5173, via concurrently.
- `npm test`: Vitest in `shared`, `tools`, and `web`. Single file or test: `npm test -w shared -- rules.test.ts -t "advances the cycle"`.
- `npm run typecheck`: `tsc --noEmit` in every package (TypeScript 7).
- `npm run build`: production build of `web`.
- `npm run ship-layout`: regenerate `Mush/derived/ship-layout.json` (renderer data) and `ship-rooms.json` (room graph for the rules) from `ShipMap.png` + `tiles.xml`. A test fails if the committed file is stale.
- `npm run types -w server`: regenerate `server/worker-configuration.d.ts` after changing `wrangler.jsonc` or the exported Durable Object classes.
- `npm run deploy -w server`: wrangler deploy (not yet configured or tested).
- No linter yet.

npm 11 blocks dependency install scripts by default. `esbuild` and `workerd` are approved in the root `package.json` `allowScripts`; new packages with install scripts need `npm install-scripts approve <pkg>`.

## Code map

- `shared/src/rules.ts`: `createGame`, `applyAction`, `legalActions`, `viewFor`. State is plain JSON (it is persisted and cloned via JSON). `viewFor` is the single place hidden info is stripped; extend its tests whenever `PlayerView` grows.
- `shared/src/config.ts`: seat count, Mush count, and AP are unconfirmed placeholders. The map is the original Daedalus (27 rooms with doors, from `Mush/derived/ship-rooms.json`); everyone starts in `LABORATORY` (confirmed).
- `shared/src/modifiers.ts`: rule modifier registry. Players hold modifier ids; items/skills register pure hooks (today: `movement`, which adjusts MP cost and the AP-to-MP conversion). `moveCost` is the single place a move's price is computed.
- `shared/src/moderation.ts`: `moderateChat` (normalize, strip invisible characters, remove links, mask a starter word list). Called by the server, not the rules.
- `shared/src/protocol.ts`: wire message types plus `parse*` validators for untrusted client input.
- `shared/src/bots.ts`: the `Bot` interface and `WanderBot` (scripted placeholder).
- `server/src/Matchmaker.ts`: single instance (`matchmaker/global`). Queues players, sets an alarm to fill with bots after 15 s, creates a `GameRoom` via `getServerByName` and calls its `setup()` over RPC, then hands each human a secret seat token.
- `server/src/GameRoom.ts`: one per game (`game-room/<uuid>`). The connection URL carries `?token=`, which maps to a seat. Persists state to DO storage on every change (with a `STATE_VERSION`; mismatched saves are discarded), sends each connection its own `viewFor`, runs bots with a deliberate delay, and handles chat (per-seat rate limit, then moderation, then `sendChat`).
- `shared/src/shipLayout.ts`: types for `Mush/derived/ship-layout.json` (per-room isometric tiles, doors with targets, sprite slices, atlas sheets).
- `tools/src/shipLayout/`: the build-time converter, with a hand-written PNG decoder and XML reader (no dependencies).
- `shared/src/characters.ts`: cosmetic crew identities (`Seat.character`), assigned by the matchmaker. No rules effect.
- `web/src/`: `App` (lobby, seat ticket in sessionStorage), `GameScreen` (three-panel layout, sends intents). The client never computes legality; it uses `view.legalActions`.
- `web/src/hud/`: `TopBar` (AP/MP pip bars from `pa1.png`/`pa2.png`), `InspectPanel` (left; opens when you click a person), `ITrackie` (right; Base UI tabs for the room log and global chat).
- `web/src/iso/`: isometric room view in the DOM. `placement.ts` is pure (no DOM): grid projection, paint order, walkable cells, standing spots, reproducing the original Flash client. `IsoRoom.tsx` renders it, one absolutely positioned div per sprite; double-clicking a reachable door sends a move. `shipLayout.ts` fetches the layout JSON and maps atlas sheets to image URLs.
- `web/src/scene/`: `ShipMap` (room cards, also clickable to move) and `CrewSprite`. `web/src/art/assets.ts` maps characters and room types to files in `Mush/`; `keyedSprite.ts` makes sprite backgrounds transparent at load time.

Implemented rules: movement (1 MP per move; with no MP, 1 AP converts to 3 MP; MP starts at 0, cap 12, kept across cycles), AP refill on "ready", the room log, and global chat. Room log visibility: public entries are the room's history, shown to anyone in that room; private entries only ever reach the actor; secret entries become room history only if another player witnessed them (this will change). Global chat is open to everyone alive until the iTrackie exists. Infection, voting, and win conditions are intentionally absent until the rules are decided.

## Open decisions

- Game name, number of players, roles, win conditions, and turn/cycle length (real-time vs. async).
- Which hosted model API to use for bots.
- Code license.
- Hosting and deployment details.
- Rendering beyond the DOM isometric view (decided: DOM for now, 2026-10-11).