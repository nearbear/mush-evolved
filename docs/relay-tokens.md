# Plan: relay tokens (pooled contributions; written 2026-10-30)

How research, NERON projects and PILGRED take contributions once players no longer have to alternate live. Replaces the "relay jobs" of `docs/action-plans.md`, whose executor is dropped (see `docs/on-call-plans.md`). Not built. **Decisions** are the owner's; **Proposed** items are Claude's and need the owner's confirmation before they are built. Do not guess them.

## The problem

The relay formula (`shared/src/relay.ts`, owner 2026-10-26) cuts a contribution's gain by `relayPenalty` for each contribution in a row by the same player to the same target, so the crew gains most by taking turns: A, B, A, B. In an asynchronous game that means either being online together or logging on in alternation, one action at a time. The owner wants the cooperation pressure kept (a lone player must not progress a research at full value, and no new AP source may appear) but not the timing pressure.

## Decisions (owner, 2026-10-30)

- **Contributions are tokens.** Each research, project or PILGRED action adds one token to that target's pool instead of rolling a gain at once. A token records who made it and what it is worth.
- **The game arranges the pool.** A target's progress is the best total any ordering of its tokens could give under the existing penalty for consecutive tokens by the same player. Players never arrange anything; they only contribute.
- **The penalty is unchanged.** If the best arrangement still has to put several of one player's tokens in a row, those tokens lose `relayPenalty` per step as they do today. A lone contributor is penalized exactly as now.
- **No new AP source.** A token costs what the action costs today (2 AP, or a Computer or Designer point); nothing is refunded or lent.

## Proposed (Claude, 2026-10-30; confirm before building)

- **All three progressibles**, since they share `relay.ts`: research, projects and PILGRED. The owner named research; confirm the other two.
- **A pool lasts the target's lifetime.** No window: a token made on day 1 can pair with one made on day 4. Simplest, and it is what "pooled efficiently" means.
- **Each token carries its own roll**, drawn when it is made, so later arrangement never re-rolls luck and a replay is deterministic.
- **Waiting work is public.** The terminal shows how much progress is held back only by the lack of another contributor. It is the coordination signal, and it is public evidence like the room log lines that already name every contributor.
- **The log stays per action.** The usual public room line ("X researched, now N%") stays; when a token also unlocks earlier work, the percent simply jumps. An extra line explaining the jump is optional (i18n, all three languages).
- **The `noRelayPenalty` cheat** makes each of that player's tokens count as if from a distinct player.

## The formula

A token is `{ by: PlayerId, base: number, roll: number }`:

- `base` is what the live formula computes before the penalty: `floor(rate × mod / 10)` plus `skillBoost` for each matching skill the player has when the token is made (`relayGainRange` today). Stored, so a later skill pick or body change never rewrites old tokens.
- `roll` is a unit roll in [0, 1) from the seeded RNG, drawn when the token is made.

A token in a position with penalty `p` is worth `g = max(0, base − p)`, rolled in [g, g + g/2] as today: `g + floor(roll × (floor(g / 2) + 1))`.

**Arrangement.** Only the player with the most tokens can ever be penalized, and only when they hold more than half of them. With `n` tokens, the dominant player `D` holding `c` of them and the others holding `m = n − c`:

- If `c ≤ m + 1`, some ordering has no two tokens by the same player adjacent (a sequence with no equal neighbours exists exactly when no symbol has more than ⌈n/2⌉ copies). Every token counts at full value.
- Otherwise `D`'s tokens are split into `m + 1` runs separated by the others' tokens, as evenly as possible: `r = c mod (m + 1)` runs of length `q + 1` and the rest of length `q = floor(c / (m + 1))`. Within a run the second token loses `relayPenalty`, the third twice that, and so on. Collect all those penalties, sort them ascending, sort `D`'s bases descending, pair them up. Everyone else's tokens stand alone between runs and count at full value.

Even runs minimize the penalty (the per-step penalty grows with run length) and pairing high bases with low penalties maximizes the sum (the floor at 0 only strengthens this). The result is the maximum over all orderings, computed in `O(n log n)` with no search.

Worked examples at base 6 and penalty 2 (minimum rolls shown):

| Tokens | Best arrangement | Progress |
|---|---|---|
| A ×6 | one run of 6: 6, 4, 2, 0, 0, 0 | 12, as today |
| A ×4, B ×4, in any order in time | A B A B A B A B | 48, as perfect live alternation |
| A ×5, B ×2 | A A B A A B A: runs 2, 2, 1 | 26 + 12 = 38 |
| A ×3 on Monday, B ×3 on Tuesday | A B A B A B | 36; today it would be 12 + 36 = 48 only if B had been there Monday |

PILGRED keeps its own constants (`mod` 2, so base 1, or 5 with the Engineer or Physicist skill).

## Properties

- **Progress never falls.** Adding a token can only improve the best arrangement, so the number shown after each action is final-as-of-now, completion is never undone, and completion side effects (a research's consumed sample, the MycoAlarm drop, PILGRED's repair) run in the contribution that crosses the line, as today.
- **No new power.** The best arrangement is a sequence the crew could have played live, so the pool never beats the best live play with the same contributions. It only removes the luck of being awake in the right order.
- **Lone work stays penalized** in exactly today's amounts, and it becomes worth more the moment someone else contributes, which is what should make a lone player ask for help.
- **Mush angle.** A Mush gains nothing new: more tokens never lower progress, a token that is never matched is just wasted AP, and the public line still names every contributor, so a Mush who never contributes is as visible as today.

## State and code

- `RelayStreak` (`lastBy`, `streak`) becomes `RelayPool = { tokens: RelayToken[] }` for `state.relay.research[id]`, `state.relay.projects[id]` and PILGRED's record in `state.pilgred`. `STATE_VERSION` bump.
- `relay.ts`: `makeToken(state, config, player, skills)` (the roll draws from the seeded RNG), `poolProgress(pool, config) → { progress, waiting }` (pure; `waiting` is the progress with all penalties waived minus `progress`), and `arrangeTokens` exposed for tests. `relayGainRange`, `rollRelayGain` and `touchRelay` go.
- `research.ts`, `project.ts` and `pilgred.ts` push a token and set the target's percent to `min(100, poolProgress(...).progress)`. Nothing else about the actions changes: cost, dirt and injury rolls, the Computer and Designer points, the dirty refusal, the public line.
- The view: research, project and PILGRED progress are already public; add `waiting` beside each (public). Nothing else from the pool goes in a view; the token list itself is never sent.

## UI

- The research, project and PILGRED terminal dialogs show `waiting` under the progress bar when it is above 0: "N% more once someone else contributes". Phone and desktop layouts; en, fr, es.
- Optional: the room log line gains a second sentence when a token unlocks earlier work.

## Bots

A scripted bot prefers a target whose last token is not its own, or one with `waiting > 0` by others (its token unlocks that work), and avoids adding a third token in a row on anything. A model bot sees `waiting` in its view like any public number. This replaces the relay plans of `docs/bot-goals-plan.md` (`startRelay`): a bot that wants help with a research posts a task slot in a channel plan (`docs/on-call-plans.md`) and works on; no one has to be online with it.

## Leak check

Everything here is public already (progress, contributor names in the room log). `waiting` is derived from public tokens. The token list, bases and rolls are never sent. A sanity test: the view is identical whoever the viewer is.

## Tests

- `poolProgress` equals the brute-force maximum over all orderings for small random pools, with mixed bases and the floor at 0.
- The examples above; a lone contributor's progress equals today's streak formula for 1 to 8 tokens.
- Progress is monotone in the token list; completion side effects fire once, on the crossing contribution.
- The roll is drawn at token time: the same seed gives the same progress whatever order the pool is later read in; a replay reproduces it.
- `waiting` is 0 whenever `c ≤ m + 1`, and equals the sum of applied penalties otherwise.
- The `noRelayPenalty` cheat; PILGRED's constants and skills; research skills (Biologist, Medic) and projects' per-project tags still apply through `base`.
- The view's `waiting` is the same for every viewer; no token data in any view.

## Open questions

- Confirm projects and PILGRED pool as research does.
- Lifetime pool, or a window (per day)? Lifetime proposed.
- Show `waiting` publicly, or only to people in the terminal's room? Public proposed (the log lines already are).
- The pace question from `docs/action-plans.md` stands: research and projects take about 11 to 17 actions without a matching skill. Pooling changes nothing about the expected value of perfect play, only how often real play reaches it.
