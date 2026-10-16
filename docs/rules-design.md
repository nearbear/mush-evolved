# Rules design: decisions and phased plan (written 2026-10-05, pruned 2026-10-13)

> **Bots (2026-10-13):** the author does not necessarily plan to run AI-controlled bots in live public games. They may be for testing only. Wherever these docs describe bots filling seats, treat live use as undecided.

The record of answered rule decisions and the design for the rules that are not built yet. Open questions live in GitHub issues labeled `rule-decision`, not here. Scheduled plans have their own document, `docs/action-plans.md`.

**Status (2026-10-13):** built are AP, MP, HP and morale values, the action registry, inventory, the iTrackie, global chat, and private channels. Not built: infection, spores, the attack, win conditions, the cycle timer, and the phases below.

## Decisions received

- **Skills and Creative** (2026-10-15, owner): every player has 3 human skill slots; a fourth comes only from books (later). Players will be able to pick skills at any time through a UI (later). For now every player spawns with Creative in one slot and the other two empty. Creative: each failure of an action that cost AP has a fixed 50% chance to give back 1 AP (the retained `CREATIVE` row in `skills.json`; the older 25% `CREATIF` row is ignored). It can't exceed the 12 AP cap because the AP was just spent; no action costs MP. A refund writes a private log line. Skills are not shown to anyone else until there is a skills UI.
- **ACTOPI and the minimap** (2026-10-13): everyone's location stays visible on the minimap, but who is where is only known while the ship's ACTOPI system is on. With it off you know who is in your own room, and everyone else is an unnamed dot (`mush.png`). ACTOPI is a ship-wide in-game system state that starts on. What turns it off or on is **undecided**; for now it is only a flag (`GameState.actopi`) with nothing switching it.
- **Players:** 16 seats, 2 Mush. If 8 or fewer players are in the room when Mush are selected, only 1 Mush. Selection may happen later than game start (for example on a later day). The code still has the placeholder of 8 seats.
- **Joining and Mush selection** (2026-10-13): one plain queue per language. Joining puts a player into that language's open ship, which is in a pre-selection phase where no one is Mush. The game starts, and Mush are chosen, when the ship fills (16) or on day 3 cycle 8, whichever comes first, with whoever has joined. There is no minimum player count: 8 or fewer players get 1 Mush, more get 2. During pre-selection there are no spore actions (there are no Mush) and all combat is disabled. Multiplayer has no bots; bots exist only in single player.
- **Single player** (2026-10-13): 9 seats. The human is always the only Mush, against 8 bots who are all human. This overrides the player-count rule (9 players would otherwise get 2 Mush). Cycles advance when the player ends them, not on the timer. Stage not decided.
- **Cycles:** AP refills on a timer, 3 hours per cycle and 8 per day (timer decided 2026-10-05, length 2026-10-13). There is no way to end a cycle early, so the "ready" action goes away. AP: start 8, +1 per cycle (+2 lying in a bed), cap 12, unspent AP carries over (2026-10-11).
- **Days** (2026-10-14): a day is 8 cycles. When it ends, every living player loses 1 morale (floor 0, nothing else happens at 0 yet). This applies from day 1, including pre-selection. The UI shows "Day N · Cycle M" (cycle within the day) and the log says "Day N begins." The log was added to the existing global cycle counter without changing it.
- **Bonding, DTT, and STT** (2026-10-14): `bond` costs 1 AP and is permanent (same for Mush). It is one-way, so each of two characters bonds with their own AP, and bonds can be made with as many people as you like. All three actions need the other person in your room. `dtt` and `stt` cost 1 AP, paid by only one of the two, and need a bond in both directions (the bond is the consent). Each gives both +2 morale (cap 14) and writes a plain private log line for each of the two. A pair shares one cooldown: after either action, both partners are blocked from DTT and STT with anyone until the next day begins (no repeats, never both on one day). A bond is visible to its two partners only (`PlayerView.bonds`, shown as a tag in Inspect). A `dtt` with exactly one Mush raises the human's contamination by 1; STT, human-human, and Mush-Mush do nothing. Default contamination capacity is 3 (raisable by modifiers via `contaminationCapacity`). Reaching it will convert the human once infection exists. The counter is hidden from everyone, including its owner. What the acronyms stand for is deliberately not written anywhere.
- **Replays** (2026-10-14; to be done by the end of private beta): every game is recorded, and its replay becomes viewable only after the game ends. A replay shows everything: roles, every room, hidden stats, and private channels. Finished games are publicly listed in chronological order. A per-player "my games" list waits for accounts. Moderators also see the raw chat text before moderation changed or blocked it. They do not see the rate-limited messages themselves, only how many messages each player had rejected by the rate limit, so they aren't wading through spam. Implementation notes: the game's setup (seats, config, seed, rules version) plus an append-only log of every input is the source of truth, and the rules re-run it, so every state change goes through one input reducer.
- **Healing** (2026-10-15, owner): the `heal` action needs a `medikit` in your own inventory (reusable, not consumed) and a living target in your room, or yourself. Costs 2 AP on someone else, 3 AP on yourself. Restores 3 HP by default (modifier hook `healAmount`; skills and research will raise it), capped at max HP. It is offered even at full HP, and writes a public room-history line. Anyone can heal; no medic role is needed. Heal uses the existing medikit, which spawns in SICK_BAY (owner confirmed this is the one they meant).
- **Medic skill, care points, sick bay healing** (2026-10-15, owner): the medic skill grants 2 care points at the start of every day (and at game start), added to the old unused `heal` resource counter. Unused points accumulate with no cap (open: add a cap?). While you hold one, any heal (self or other) costs 0 AP and spends one automatically; they do not replace the means to heal. In the SICK_BAY anyone can heal without a medikit at the normal AP costs. Nobody has the medic skill by default yet (no skill picker).
- **Punch** (2026-10-15, owner; issue 29): the `punch` action costs 1 AP and deals 2 damage (`hit` elsewhere in this document). Only a living person in your own room can be targeted, never yourself. It misses 40% of the time (the AP is still spent). It is a public action: hit or miss, a line goes in the room's history. HP stops at 0 (death is undecided); no per-cycle limit was set. Cameras are not considered yet.
- **Statuses and satiety** (2026-10-14, owner): the first statuses are `dirty` (cheese icon, public), `full belly` (apple icon, private) and `hungry` (fork icon, private). Extracting a spore always makes you dirty; dirty has no removal until a cleaning action exists. Humans (not Mush) have satiety: start 0, no cap, most consumables raise it, it falls 1 per cycle (some things will make it fall more; modifier hook `satietyPerCycle`), never below 0. At 3 or more satiety you have full belly and can't eat anything. After exactly 24 cycles following the cycle satiety reached 0 (the game start counts), if still 0, you are hungry and lose 1 HP per cycle; any consumable resets the count and ends hunger. Mush have no satiety, never get hungry and can eat freely. Placeholders: coffee +1 satiety, `cooked_ration` +4. HP stops at 0 (death is undecided). Public statuses show on the Inspect panel for people in your room; private ones only in your own view.
- **Showering** (2026-10-14, owner): the `shower` action targets a shower (Bedroom Alpha and Beta have one) and is only offered while dirty. It costs 2 AP, 1 less if soap is in your inventory (the soap stays). It removes `dirty`; a Mush also takes 4 damage (HP stops at 0). The log line is private: nobody sees a shower, only the soap being taken and dropped in public history. One soap always spawns in the Alpha dorm for now, with the `soap` item icon.
- **Spores:** Mush have a spore resource. `extract_spore` costs 1 AP, gives 1 spore, and always applies the **dirty** status. Only a fixed number of spores can be extracted per day.
  - **Extraction answers (2026-10-14, owner):** Mush only. Each Mush can extract once per 4 cycles (a cooldown on the global cycle counter, not tied to days; ready immediately when Mush are chosen). Each Mush holds their own spore count (no per-Mush limit for now). The whole Mush faction shares a daily cap, 4 by default, reset at the day boundary; skills and research will modify it (modifier hook `sporesPerDay`). At the cap the action is not offered. Teammates' spore counts will be visible to Mush later; no UI place yet. The log line is private. **Dirty is deferred** until a status system exists (done 2026-10-14, see "Statuses and satiety").
- **Combat:** no voting. The basic attack (the punch, `hit` in this document) costs 1 AP and deals 2 damage (changed from 1 on 2026-10-13; a placeholder until combat is designed). Max HP 14, start 14; morale max 14, start 7; both private to their owner (2026-10-11).
  - **Spiking (2026-10-15, owner):** `spike` targets a living human in your room (not a Mush). Mush only; costs 1 AP and 1 spore; always succeeds; raises the human's contamination by 1, capped at capacity (3 by default, `contaminationCapacity`). Converting at capacity is still not built. The victim is not told. The log line is secret: other living players in the room (never the victim) see it, otherwise only the Mush does. Contamination stays hidden from every view.
- **Win conditions:**
  - Mush win if all humans are dead, or if the ship returns to Sol while any Mush is alive.
  - Humans win if the ship returns to Sol with no Mush alive.
- **Visibility:** Mush know each other and have a private chat channel.
- **Chat:** room speech is always available and is written into the room log like a public action. Global chat requires an **iTrackie** in your inventory.
- **Inventory** (2026-10-11): 3 private slots, unlimited room storage, free take/drop logged publicly.
- **iTrackie** (2026-10-13): everyone starts with one; it is a normal item (uses a slot, can be dropped or taken); carrying one is required to read and post in global chat and the feature threads.
- **Room log visibility** (2026-10-11): the room log is that room's history. Private actions never show to other players; secret actions are logged to the room only if another player is there to witness them (this will change). Implemented in `shared/src/log.ts` (`logPublic`/`logPrivate`/`logSecret`).
- **Titles and succession** (2026-10-14, #144): each title has its own line of succession, an ordered list of the crew (the order for each title is **undecided**). Titles are issued at the same time as Mush selection, each to the first person in its line. When a holder dies or goes inactive, the title passes to the next person in the line who is alive and active. A former holder who becomes active again does not get the title back; they can only regain it through the normal succession, if the current holder loses it and they are the next eligible person. Which titles exist is **undecided**; the communications officer is one.
- **Trading crew to merchant ships** (2026-10-14, #143): the communications officer can trade crew members away to a merchant ship, but only **inactive** players (#145). Trading away an inactive Mush is allowed and removes them from the ship. Inactive and super inactive are two levels of status (Private beta); their thresholds are **undecided**.
- **Code license:** MIT.
- **Bots:** run locally for now, on the RTX 3070 (8 GB VRAM; WSL has 15 GB RAM).

## Phases

Each phase ends with typecheck and tests passing and a small commit. Phase headings note which open questions (now `rule-decision` issues) they wait on.

### Phase 1: rules core in `shared` (needs the infection, Sol, and death decisions)

- **Time as an input, not a clock read.** Add a `tick` that the server calls when a cycle boundary passes, for example `advanceCycles(state, n)`. The rules stay pure and tests can jump days instantly.
  - Tradeoff: the server owns real time and the rules only count cycles. That keeps rules deterministic, at the cost of the server having to compute how many cycles were missed after downtime.
- **Delete `ready`.** Cycles advance only on `tick`.
- **Player state additions:** HP, status effects (starting with `dirty`), spore count, and an inventory (minimal, only what the iTrackie needs).
- **Ship state:** spores extracted today (reset at each day boundary), the ship's position or Sol-return progress once the Sol trip is decided, and whether Mush have been selected yet.
- **Mush selection:** a separate step (`selectMush`) run when the selection trigger is decided. It picks 1 or 2 Mush from the eligible players using the seeded RNG.
- **Actions:**
  - `extract_spore`: enforces the daily cap.
  - The infect action, once decided.
  - `hit`: decrements HP; at 0 HP the player dies.
  - The return-to-Sol action, once decided.
- **Win/end checks** after every action and tick. When the game ends, `phase: "ended"` records the winner.
- **Tests:**
  - Mush count is 1 vs 2 around the 8-player boundary.
  - The daily spore cap holds and resets on the day boundary.
  - Extracting a spore always applies `dirty`.
  - AP refills only on a tick, never by action.
  - Each win condition triggers correctly.
  - Determinism for a given seed.

### Phase 2: visibility and chat rules in `shared` (mostly built: global and private channels)

- **`viewFor`:**
  - A Mush sees the roles of the other Mush; everyone else still sees no roles.
  - Log entries get a scope: public, room, Mush-only, or private.
  - Tests check, for every seat, that a human's view has no roles except their own.
- **`say` action:** writes a room-scoped log entry and costs no AP (I'll assume no cost unless you say otherwise).
- **Global chat:** a separate message type allowed only for players holding an iTrackie.
- **Mush chat:** a channel filtered in `viewFor`, the same as the log scopes.

### Phase 3: server (needs the late-joiner and bot-seat decisions)

- **`GameRoom` timing:** use a Durable Object alarm for cycle ticks instead of `setTimeout`, so ticks survive restarts. On wake, apply any missed cycles.
- **Dev time scale:** an env var (for example `CYCLE_SECONDS=30` locally) so a "day" passes in minutes during testing.
- **Matchmaker:** 16 seats, plus the late-join behavior once decided.
- **Chat safety:**
  - A per-player chat rate limit.
  - A max message length.
  - A basic word-filter moderation hook, plain code with no new dependency to start.
  - A report/mute path deferred and noted.
- **Fix the known gap:** idle humans can no longer stall the game, because ticks ignore readiness.


### Phase 4: client

- Show HP, status effects, spores (Mush only), and the cycle countdown.
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
