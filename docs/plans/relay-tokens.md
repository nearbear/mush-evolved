# Plan: relay tokens (pooled contributions; written 2026-10-30)

How research, NERON projects and PILGRED take contributions once players no longer have to alternate live. Replaces the "relay jobs" of `docs/plans/action-plans.md`, whose executor is dropped (see `docs/plans/on-call.md`). "Relay tokens" is the owner's name for this system behind the scenes (code and docs). Players see research tokens as **samples**, which also go through a pending stage with assays and sabotage, `docs/plans/research-sabotage.md`. Part A (pools for all three, no pending stage) built 2026-10-31; part B (research samples and assays) built the same day. **Decisions** are the owner's. Do not guess beyond them.

## The problem

The relay formula (`shared/src/relay.ts`, owner 2026-10-26) cuts a contribution's gain by `relayPenalty` for each contribution in a row by the same player to the same target, so the crew gains most by taking turns: A, B, A, B. In an asynchronous game that means either being online together or logging on in alternation, one action at a time. The owner wants the cooperation pressure kept (a lone player must not progress a research at full value, and no new AP source may appear) but not the timing pressure.

## Decisions (owner, 2026-10-30)

- **Contributions are tokens.** Each research, project or PILGRED action adds one token to that target's pool instead of rolling a gain at once. A token records who made it and what it is worth.
- **The game arranges the pool.** A target's progress is the best total any ordering of its tokens could give under the existing penalty for consecutive tokens by the same player. Players never arrange anything; they only contribute. (Player rearrangement on a hex grid was explored and deferred, `docs/plans/research-sabotage.md`.)
- **The penalty is unchanged.** If the best arrangement still has to put several of one player's tokens in a row, those tokens lose `relayPenalty` per step as they do today. A lone contributor is penalized exactly as now.
- **No new AP source.** A token costs what the action costs today (2 AP, or a Computer or Designer point); nothing is refunded or lent.
- **All three progressibles pool:** research, projects and PILGRED. Only research has the pending stage and sabotage (`docs/plans/research-sabotage.md`).
- **Research's token list is the evidence:** visible to anyone in the lab, with faces and values; research becomes private, with no room log line (`docs/plans/research-sabotage.md`). This answers the log-credit question: the list and the assay lines show who did what.
- **Pace:** no retune before building; the owner expects contamination to offset the gain from pooling. Watch it in playtests.

## Decisions (owner, 2026-10-31)

- **Name:** "relay tokens" behind the scenes; research tokens are "samples" to players (`docs/plans/research-sabotage.md`). All three progressibles still pool (reconfirmed).
- **The gain if you contribute now.** Every action that adds a relay token (research's Participate, projects, PILGRED) shows on its button how much the target goes up if you contribute now. That can be more than your token is worth on its own, when your token is what breaks up someone else's streak.
- **Progress is visible only to living players in the target's room until it completes.** Research (the lab), projects (the NERON core's room) and PILGRED (a room with a PILGRED terminal): nobody outside that room sees anything about the target, not its progress, `waiting`, the gain or its token list. Completion is the only news that reaches other rooms. This replaces today's public research and project progress.
- **The help text** sentence below, in the owner's wording.
- **Projects may finish faster** with pooling and no sabotage; accepted, since projects are pro-survival rather than anti-Mush. The owner may add a mechanic for them later.
- **A pool lasts the target's lifetime.** No window: a token made on day 1 can pair with one made on day 4. A window would bring back the timing pressure.

## Decisions (proposed by Claude 2026-10-30, confirmed by the owner 2026-10-31)

- **Each token draws a roll when it is made**, so a replay is deterministic. **Rolls go to slots** (owner, 2026-10-31, after a stress test showed a token keeping its own roll can make progress fall, e.g. a lone player at base 5, 5, 5 then 6: 12 then 11): the pool's rolls, highest first, go to the arranged values (`max(0, base − penalty)`), highest first. No failures in 300,000 random pools; tested in `shared/tests/relay.test.ts`.
- **Waiting work is shown** (players could work it out anyway, so the game does the sum). The terminal shows how much progress is held back only by the lack of another contributor, to those who see the target's progress (in its room, above).
- **Projects and PILGRED** are a plain token pool for now: no pending stage, and they keep their room log lines as today, and their token lists are shown at their own terminals the same way, to people in that room, as for research (owner, 2026-10-31).
- **The `noRelayPenalty` cheat** is fixed when the token is made: each such token counts as if from a distinct player, whatever the cheat's state later.
- **No migration.** No games are in progress, so the `STATE_VERSION` bump simply retires old snapshots (`GameRoom.onStart` already does this). There is no `banked`. The NERON update still sets a project to 100 directly (`comms.ts`); a target's percent is stored and only rewritten from `poolProgress(...)` by a contribution, which is illegal once it is complete, so that direct completion holds.

## The formula

A token is `{ by: PlayerId, base: number, roll: number }`:

- `base` is what the live formula computes before the penalty: `floor(rate × mod / 10)` plus `skillBoost` for each matching skill the player has when the token is made (`relayGainRange` today). Stored, so a later skill pick or body change never rewrites old tokens.
- `roll` is a unit roll in [0, 1) from the seeded RNG, drawn when the token is made (today no draw is made when the range is a single value, so the RNG stream changes; `STATE_VERSION` bump).

A token in a position with penalty `p` is worth `g = max(0, base − p)`, rolled in [g, g + g/2] as today: `g + floor(roll × (floor(g / 2) + 1))`, where `roll` is the pool's roll for that slot (rolls sorted high to low against the `g`s sorted high to low; see Decisions).

**The objective.** The best arrangement maximizes the sum of `g` (before rolls). Ties go the same way every time: among equal bases, the earlier token takes the lower penalty. The rolls are then applied to the arranged values. Maximizing the rolled total instead would make the arrangement depend on the rolls (two equal-base tokens with rolls 0.99 and 0.0 in penalty slots 0 and 2 give 13 one way and 12 the other) and the fast method below would not compute it.

**Arrangement.** Only the player with the most tokens can ever be penalized, and only when they hold more than half of them. With `n` tokens, the dominant player `D` holding `c` of them and the others holding `m = n − c`:

- If `c ≤ m + 1`, some ordering has no two tokens by the same player adjacent (a sequence with no equal neighbours exists exactly when no symbol has more than ⌈n/2⌉ copies). Every token counts at full value.
- Otherwise `D`'s tokens are split into `m + 1` runs separated by the others' tokens, as evenly as possible: `r = c mod (m + 1)` runs of length `q + 1` and the rest of length `q = floor(c / (m + 1))`. Within a run the second token loses `relayPenalty`, the third twice that, and so on. Collect all those penalties, sort them ascending, sort `D`'s tokens by base descending (then roll descending), pair them up. Everyone else's tokens stand alone between runs and count at full value.

Even runs give the elementwise smallest sorted penalty list, and pairing high bases with low penalties maximizes the sum of `max(0, base − p)` (it is convex, so the floor at 0 only strengthens this). The result is the maximum of the objective over all orderings, in `O(n log n)` with no search.

**For players:** "Your contributions only lose value when you've made more than everyone else combined, plus one." This sentence goes in the terminal's help text.

Worked examples at base 6 and penalty 2 (minimum rolls shown):

| Tokens | Best arrangement | Progress |
|---|---|---|
| A ×6 | one run of 6: 6, 4, 2, 0, 0, 0 | 12, as today |
| A ×4, B ×4, in any order in time | A B A B A B A B | 48, as perfect live alternation |
| A ×5, B ×2 | A A B A A B A: runs 2, 2, 1 | 26 + 12 = 38 |
| A ×3 on Monday, B ×3 on Tuesday | A B A B A B | 36; today 12 + 12 = 24 |

PILGRED keeps its own constants (`mod` 2, so base 1, or 5 with the Engineer or Physicist skill). Without a skill its pool can reach about 100 tokens; that is still small state.

## Properties

- **Progress never falls.** Adding a token can only improve the best arrangement (append it at the end of any ordering), so the number shown after each action is final-as-of-now, completion is never undone, and completion side effects (PILGRED's repair, a project's effect) run in the contribution that crosses the line, as today. Research completes at an assay instead (`docs/plans/research-sabotage.md`). With the tie-break, this must be tested for the rolled total too (see Tests); if it fails, rolls move from tokens to slots.
- **No new power.** The best arrangement is a sequence the crew could have played live, so the pool never beats the best live play with the same contributions. It only removes the luck of being awake in the right order.
- **Lone work stays penalized** in exactly today's amounts, and it becomes worth more the moment someone else contributes, which is what should make a lone player ask for help. Solo work becomes an investment rather than a loss.
- **Mush angle.** More tokens never lower progress, a token that is never matched is just wasted AP, and the log still names every contributor to those present. A Mush can make the single contribution that unlocks a big jump, but the token list shows exactly what each token is worth, so it earns no extra credit. Research sabotage is in `docs/plans/research-sabotage.md`.

## State and code

- `RelayStreak` (`lastBy`, `streak`) becomes `RelayPool = { tokens: RelayToken[] }` for `state.relay.research[id]`, `state.relay.projects[id]` and PILGRED's record in `state.pilgred`. Research pools also get `pending` (`docs/plans/research-sabotage.md`). `STATE_VERSION` bump, no migration.
- `relay.ts`: `makeToken(state, config, player, skills)` (the roll draws from the seeded RNG; the cheat is read here), `poolProgress(pool, config) → { progress, waiting }` (pure; `waiting` is `min(100, progress with all penalties waived) − progress`), and `arrangeTokens` exposed for tests. `relayGainRange`, `rollRelayGain` and `touchRelay` go.
- `research.ts`, `project.ts` and `pilgred.ts` push a token and set the target's percent from `poolProgress(...)` (research: of the verified tokens, `docs/plans/research-sabotage.md`). Nothing else about the actions changes: cost, dirt and injury rolls, the Computer and Designer points, the dirty refusal, the public line.
- The view: `waiting` beside each progress, with the same visibility as that progress (all three are room-gated until complete). Each viewer also gets their own token count per target (their own information) and, in the target's room, the gain if they contribute now. A viewer in the room of a target's terminal also gets that target's token list (contributor and value). Nothing else from the pool goes in a view.

## UI

- The research, project and PILGRED terminal dialogs show `waiting` under the progress bar when it is above 0: "up to N% more once others contribute". Phone and desktop layouts; en, fr, es.
- Every relay-token button (research's Participate, projects, PILGRED) shows the gain if you contribute now.
- The help text sentence above.

## Bots

A scripted bot uses its own token count and `waiting`: it prefers a target where its count is not above everyone else's combined plus one, and one with `waiting > 0` caused by others (its token unlocks that work). A model bot sees the same numbers in its view. A bot sees a target's progress, `waiting` and token list only while in that terminal's room, like a human (architecture rule 5: own seat's view only). This replaces the relay plans of `docs/plans/bot-goals.md` (`startRelay`): a bot that wants help with a research posts a task slot in a channel plan (`docs/plans/on-call.md`) and works on; no one has to be online with it.

## Leak check

- Research, project and PILGRED progress are visible only in the target's room until it completes (owner, 2026-10-31); only completion is public. `waiting`, the gain and the token list follow the same rule. Only living viewers count, as PILGRED's gate already does (`rules.ts` `viewFor`).
- The token list (contributor and value) goes only to viewers in the terminal's room; values reveal skill bonuses of absent contributors (owner accepted, 2026-10-30). Rolls and `contaminated` are never sent.
- Tests: outside a target's room, or for a dead viewer, its progress, `waiting`, gain and token list are null and only completion shows; inside, `waiting` is the same for every viewer.

## Tests

- The objective (sum of `g`) from `arrangeTokens` equals the brute-force maximum over all orderings for small random pools (up to 8 tokens), with mixed bases and the floor at 0.
- The rolled total with the tie-break is monotone as tokens are added, over random pools and rolls.
- The examples above; a lone contributor's progress equals today's streak formula for 1 to 8 tokens.
- Completion side effects fire once, on the crossing contribution.
- The roll is drawn at token time: the same seed gives the same progress whatever order the pool is later read in; a replay reproduces it.
- `waiting` is 0 whenever `c ≤ m + 1`, never above `100 − progress`, and for a lone contributor equals full-value progress minus the streak formula's (A ×6 at minimum rolls: 36 − 12 = 24).
- The `noRelayPenalty` cheat, fixed at token time; PILGRED's constants and skills; research skills (Biologist, Medic) and projects' per-project tags still apply through `base`.
- The NERON update's direct completion of a project still holds.
- The view rules in "Leak check".

## Open questions

None left.
