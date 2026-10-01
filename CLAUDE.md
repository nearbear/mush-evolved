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

- TypeScript everywhere; React for the web client.
- **PartyKit / partyserver** (Cloudflare Durable Objects) for the realtime server, with custom authoritative rooms.
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

- The eMush game assets are licensed **CC BY-NC-SA 4.0** (per the `LICENSE.md` in the source repository): attribution required, non-commercial only, adaptations must be shared under the same license.
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

## Build order

1. Scaffold the repo, CLAUDE.md, and tooling.
2. Rules as a pure state machine in `shared`, with tests.
3. Server: authoritative room wrapping the state machine, per-player views, then the matchmaker.
4. Plain DOM client, playable end to end even if ugly.
5. Bots behind the interface: scripted first, then the hosted model API.
6. Visuals: a renderer consuming the same views, then animations.
7. Deploy, write-up, README with a demo GIF.

## Commands

TBD. Fill in after scaffolding (install, dev, test, typecheck, lint, build, deploy).

## Open decisions

- Game name, number of players, roles, win conditions, and turn/cycle length (real-time vs. async).
- Which hosted model API to use for bots.
- Code license.
- Hosting and deployment details.
- Which rendering approach once the DOM prototype works.