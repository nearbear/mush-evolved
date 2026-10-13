# Plan: first real ruleset (written 2026-10-05)

Based on the rule decisions given on 2026-10-05. Nothing here is implemented yet. **Open questions** are things I need answered before building that part; I won't guess them.

## Decisions received

- **Players:** 16 seats, 2 Mush. If 8 or fewer players are in the room when Mush are selected, only 1 Mush. Selection may happen later than game start (for example on a later day).
- **Cycles:** AP refills every few hours on a timer. There is no way to end a cycle early, so the "ready" action goes away.
- **Spores:** Mush have a spore resource. `extract_spore` costs 1 AP, gives 1 spore, and always applies the **dirty** status. Only a fixed number of spores can be extracted per day.
- **Combat:** no voting. `hit` costs 1 AP and deals 1 damage.
- **Win conditions:**
  - Mush win if all humans are dead, or if the ship returns to Sol while any Mush is alive.
  - Humans win if the ship returns to Sol with no Mush alive.
- **Visibility:** Mush know each other and have a private chat channel.
- **Chat:** room speech is always available and is written into the room log like a public action. Global chat requires an **iTrackie** in your inventory.
- **Code license:** MIT.
- **Bots:** run locally for now, on the RTX 3070 (8 GB VRAM; WSL has 15 GB RAM).

## Open questions

Phases that depend on these are marked below.

1. **Mush selection timing.** What triggers it: a fixed day/cycle, a config value, or something else? Before selection, is everyone human with no spore actions? *(Phase 1)*
2. **Late joiners and bots.** If selection happens on a later day, can players join a game already running? Do bots still fill empty seats, and do bots count toward the "8 or fewer" rule? Can bots be Mush? *(Phases 1, 3)*
3. **Cycle numbers.** How many hours per cycle, how much AP per refill, the AP cap, and cycles per day? eMush uses 3-hour cycles, 8 per day, +1 AP per cycle, 12 AP cap. Is that the intent? *(Phase 1. AP answered 2026-10-11: start 8, +1 per cycle (+2 lying in a bed), cap 12, carries over. Cycle length and cycles per day still open.)*
4. **What spores do.** How does a Mush use a spore to infect a human: action name, AP cost, same room? How many spores convert a human, and does the target notice? *(Phase 1, the biggest gap)*
5. **Who can extract, and the daily limit.** Is `extract_spore` Mush-only? What is the daily number, and is it ship-wide or per Mush? *(Phase 1)*
6. **Dirty status.** Does it do anything yet (for example, visible to others in the room), or is it just a flag for now? How is it removed? *(Phase 1)*
7. **Combat details.** Max HP? *(Answered 2026-10-11: max 14 HP, start 14; morale max 14, start 7; both private to their owner. Nothing changes them yet.)* Must the target be in the same room? Does a hit always land? What happens on death (body left, items dropped, a log line)? *(Phase 1)*
8. **Returning to Sol.** What action or condition triggers it, who can do it, and where (bridge/command center)? Without this, humans can never win. *(Phase 1)*
9. **iTrackie.** Does everyone start with one? Can it be dropped, stolen, or found? This decides how much of an inventory system the slice needs. *(Phase 2)* *(Inventory answered 2026-10-11: 3 private slots, unlimited room storage, free take/drop logged publicly. iTrackie answered 2026-10-13: everyone starts with one; it is a normal item (uses a slot, can be dropped or taken); carrying one is required to read and post in global chat and the feature threads. Stealing and finding are still open.)*
10. ~~**Room log visibility.**~~ Answered 2026-10-11: the room log is that room's history. Private actions never show to other players; secret actions are logged to the room only if another player is there to witness them (this will change). Implemented in `shared/src/rules.ts` (`logPublic`/`logPrivate`/`logSecret`).

## Phases

Each phase ends with typecheck and tests passing and a small commit.

### Phase 0: housekeeping (no questions needed)

- Add an MIT `LICENSE` for the code. Note in the README that the `Mush/` assets stay CC BY-NC-SA.
- Update `CLAUDE.md`: move the answered items out of "Open decisions" and record the rules above.
- Commit `docs/next-steps.md` and this plan.

### Phase 1: rules core in `shared` (needs answers to Q1, Q3–Q8)

- **Time as an input, not a clock read.** Add a `tick` that the server calls when a cycle boundary passes, for example `advanceCycles(state, n)`. The rules stay pure and tests can jump days instantly.
  - Tradeoff: the server owns real time and the rules only count cycles. That keeps rules deterministic, at the cost of the server having to compute how many cycles were missed after downtime.
- **Delete `ready`.** Cycles advance only on `tick`.
- **Player state additions:** HP, status effects (starting with `dirty`), spore count, and an inventory (minimal, only what the iTrackie needs).
- **Ship state:** spores extracted today (reset at each day boundary), the ship's position or Sol-return progress per Q8, and whether Mush have been selected yet.
- **Mush selection:** a separate step (`selectMush`) run when Q1's trigger fires. It picks 1 or 2 Mush from the eligible players using the seeded RNG.
- **Actions:**
  - `extract_spore`: enforces the daily cap.
  - The infect action from Q4.
  - `hit`: decrements HP; at 0 HP the player dies.
  - The return-to-Sol action from Q8.
- **Win/end checks** after every action and tick. When the game ends, `phase: "ended"` records the winner.
- **Tests:**
  - Mush count is 1 vs 2 around the 8-player boundary.
  - The daily spore cap holds and resets on the day boundary.
  - Extracting a spore always applies `dirty`.
  - AP refills only on a tick, never by action.
  - Each win condition triggers correctly.
  - Determinism for a given seed.

### Phase 2: visibility and chat rules in `shared` (needs Q9, Q10)

- **`viewFor`:**
  - A Mush sees the roles of the other Mush; everyone else still sees no roles.
  - Log entries get a scope: public, room, Mush-only, or private.
  - Tests check, for every seat, that a human's view has no roles except their own.
- **`say` action:** writes a room-scoped log entry and costs no AP (I'll assume no cost unless you say otherwise).
- **Global chat:** a separate message type allowed only for players holding an iTrackie.
- **Mush chat:** a channel filtered in `viewFor`, the same as the log scopes.

### Phase 3: server (needs Q2)

- **`GameRoom` timing:** use a Durable Object alarm for cycle ticks instead of `setTimeout`, so ticks survive restarts. On wake, apply any missed cycles.
- **Dev time scale:** an env var (for example `CYCLE_SECONDS=30` locally) so a "day" passes in minutes during testing.
- **Matchmaker:** 16 seats, plus late-join behavior from Q2.
- **Chat safety:**
  - A per-player chat rate limit.
  - A max message length.
  - A basic word-filter moderation hook, plain code with no new dependency to start.
  - A report/mute path deferred and noted.
- **Fix the known gap:** idle humans can no longer stall the game, because ticks ignore readiness.

### Phase 4: client

- Show HP, status effects, spores (Mush only), inventory, and the cycle countdown.
- A room log with speech input.
- A global chat tab, shown only with an iTrackie.
- A Mush chat tab, shown only to Mush.
- Still plain DOM, still driven only by `PlayerView`.

### Phase 5: local model bots

- **Recommendation:** run a local OpenAI-compatible server, either **Ollama** (easiest) or **llama.cpp's `llama-server`** (lighter, more control), with a ~4B instruct model at Q4 quantization.
  - On 8 GB VRAM that leaves room for long prompts.
  - An ~8B Q4 model also fits but is tight.
  - Check current model rankings when picking a specific model.
- **Bot interface:**
  - The model-backed bot speaks the OpenAI chat-completions format, with base URL, model name, and key in `.dev.vars`.
  - Switching later to a cheap hosted API, or to Triton (which also offers an OpenAI-compatible frontend), is then a config change, not a code change.
  - When you want a cheap hosted fallback, compare current per-token prices; I have no live pricing.
- **Fits the cycle structure:** cycles last hours, so bots can queue requests one at a time and the single GPU is never a bottleneck.
- **Safeguards:**
  - The bot must pick from `view.legalActions`. Any invalid output falls back to the scripted bot.
  - Player chat goes into the prompt marked as untrusted quoted text.
  - A per-game request cap.
  - The "hard spend cap" becomes a token/request budget, kept so it still works if you switch to a hosted API.
- **Dependency note:** Ollama or llama.cpp is a system install, not an npm package. I'll ask before installing either.
- **Public access later:** running everything on your machine is fine for development. When the game goes public, either deploy the game server to Cloudflare and keep only the model local, or expose your machine through a tunnel. Decide this at deploy time.

## Suggested order for the next session

1. Answer the open questions (short answers are fine).
2. Phase 0.
3. Phase 1, then Phase 2. These are the core of the game, fully testable without a browser.
4. Phases 3–5.
