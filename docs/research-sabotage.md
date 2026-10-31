# Plan: research sabotage with breakthroughs (written 2026-10-30)

How a Mush sabotages research without being caught by bookkeeping, built on the pooled contributions of `docs/relay-tokens.md`. Not built. **Decisions** are the owner's; **Proposed** items are Claude's and need the owner's confirmation before they are built; **Open questions** block the part they belong to. Do not guess them.

## The problem

Research is where the lab Mush characters (Finola, Ian) are expected to spend their time, and the lab is where the crew usually installs a camera, which reveals covert actions. A lab Mush has no sabotage that works there, so playing one is mostly playing a human. Sabotage needs to hide inside the research action itself, and leave the crew with suspicion, never proof: if spoiled work can be traced to one player by elimination (everyone reports what they did), a careful crew rules the Mush out of nothing and in for everything.

Inspiration: Battlestar Galactica's skill checks (contributions go in face down, two random cards from the Destiny deck are mixed in, the pile is shuffled and revealed together, so a failure could always be random), plus a delay, so that by the time sabotage shows, many people have touched the bench.

## Decisions (owner, 2026-10-30)

- **Pending tokens and breakthroughs.** A research token lands as *pending*. A **breakthrough** resolves all of a research's pending tokens together. Breakthroughs happen at the **quarter marks** (25, 50, 75 and 100%).
- **Spoiling.** At a breakthrough, a contaminated token spoils, and every other pending token spoils with a **flat 5% chance** (the noise). A spoiled token counts as zero.
- **Every Mush can spoil their own tokens** (fake work that looks like a contribution).
- **A Mush skill lets its holder contaminate other players' pending tokens**, and the holder **picks** which token.
- **Only people in the room see a breakthrough's result** (which tokens spoiled and whose they were).
- **Research only.** Projects and PILGRED use the token pool (`docs/relay-tokens.md`) but have no pending stage and no sabotage for now.
- **Word:** "breakthrough", not "assay".
- **The token list is the evidence, seen only in the lab.** Anyone in the lab sees a research's tokens, verified and pending, each with the contributor's face and its value (values reveal skill bonuses; accepted). Nobody elsewhere sees them.
- **Research becomes a private action:** no room log line when someone contributes. The token list is the record of who worked.
- **Pace:** no retune of `rate` or `relayPenalty` before building. The owner expects the gain from optimal pooling to be offset by contamination; watch it in playtests.
- **No grid for now.** The hex grid and player rearrangement (below, "Deferred") are not part of this pass.

## Proposed (Claude, 2026-10-30; confirm before building)

- **Verified and pending pools.** Research progress is the best arrangement (`docs/relay-tokens.md`) of the **verified** tokens only. Pending tokens show as a striped segment of the bar: the best arrangement of verified plus pending, minus verified progress.
- **The trigger.** A breakthrough runs when the striped total reaches the first quarter mark above verified progress. Survivors join the verified pool and the pool is rearranged.
- **"Counts as zero" means leaving the pool.** A spoiled token is dropped as if never made, so it no longer separates anyone's run. Spoiling a rare contributor's token therefore also costs the players around it their relay benefit (worked example below), which is what gives a skilled Mush something to strategize about without a grid.
- **Verified progress never falls.** Spoils only remove pending tokens and adding tokens never lowers the best arrangement, so `relay-tokens.md`'s "progress never falls" holds for verified progress, and completion side effects stay safe.
- **Short of the mark.** If spoils leave verified progress below the mark, the next contributions trigger that mark's breakthrough again.
- **Completion.** A research completes only at a breakthrough that leaves verified progress at 100. The sample is consumed and the MycoAlarm drops then, not when the striped bar reaches 100.
- **Spoiling your own token** is a choice on the research action itself ("contribute a spoiled sample"), same AP. The token looks the same as an honest one in the lab's list until the breakthrough. Research is private, so cameras see nothing either way.
- **Contaminating** is a private action at the research terminal, in the lab. It changes nothing visible until the breakthrough.
- **Completion lines stay public** ("MycoAlarms built", the serum on the floor): they announce things in the room, not who worked.
- **The breakthrough line** (lab room log, i18n en/fr/es): "Mycoscan breakthrough: 4 samples, 1 spoiled (Paola's)." It never says why a token spoiled.

### Worked example

Base 6, penalty 2, minimum rolls. Verified pool is empty. Pending: A, A, A, B (in any order).

- All pass: best arrangement A B A A → 6 + 6 + 6 + 4 = 22.
- B's token spoils: A A A → 6 + 4 + 2 = 12. B's token was worth 6, but spoiling it cost 10, because A's tokens lost their separator.

## State and code

- `RelayPool` for research gains `pending: RelayToken[]`; each research token gains `contaminated: boolean`, and the state records who contaminated it (`contaminatedBy`, for the replay and the history; never in a view).
- `config.research.spoilChance: 0.05`. The noise rolls are drawn at the breakthrough from the seeded RNG, one per pending token, in token order, so a replay reproduces them.
- `breakthrough(state, research)` in `shared/src` (pure): rolls spoils, moves survivors to `tokens`, drops the rest, writes the room log line, runs completion. Called from the research action when the trigger is reached.
- Views: verified progress (public, as today) and the striped pending total (see the open question). For a viewer in the lab: each research's token list, verified and pending, with contributor and value. Never sent: `contaminated`, `contaminatedBy`, the spoil rolls, and whether a spoil was noise or contamination.
- `research.ts`: visibility `private`, and the `researched` / `researchCompleted` room lines go (completion's item lines stay).

## Leak check

- The cause of a spoil (noise or a Mush) must not be derivable from any view, log line or timing. The line is identical either way.
- Contaminating is private: no log line, no camera, no change in any other player's view before the breakthrough.
- The token list goes only to viewers in the lab. Its values reveal the skill bonuses of contributors who are not there (the owner accepted this).
- The skill's target picker shows the same list any lab viewer sees, nothing more.
- Run `leak-check` when this is built.

## Tests

- A breakthrough fires exactly at each quarter mark, re-fires at the same mark after spoils leave it short, and the 100% one completes the research only if verified progress reaches 100.
- A contaminated token always spoils; others spoil at 5% (seeded); a spoiled token leaves the pool, including the separator effect in the worked example.
- Verified progress never falls across any sequence of contributions and breakthroughs.
- Own-spoil: every other player's view, including the lab's token list, is identical to an honest contribution's until the breakthrough.
- Contamination: no view or log changes before the breakthrough; the breakthrough line is identical for noise and contamination.
- Room-only visibility of the breakthrough line and the token list; no log line for a contribution.
- Replay: the same seed and actions give the same spoils.

## Open questions

- **The skill.** A new Mush skill, or an extension of an existing one (Saboteur, `sapper`)? Its name, AP cost, and uses per day.
- **Can the skill target another Mush's token, or an already contaminated one?**
- **Who sees the striped pending segment:** everyone, as research progress is public today, or only the lab, like the token list?
- **What a late arrival sees:** whether the breakthrough line stays in the lab's log for players who enter afterwards follows the normal room log rules; confirm that is intended.
- **Bots:** how a scripted Mush bot uses own-spoil and the skill.

## Deferred

- **Player rearrangement on a hex grid** (owner's idea, 2026-10-30): tokens on hexes with the contributor's face and value, a path through the grid giving the order, adjacent swaps. Problems found: a free swap is busywork and makes scrambling free, an AP swap competes with contributing, a swap tied to contributing was suggested, and token values reveal skills to people in other rooms. Kept for a later pass once breakthroughs have been played.
- **Ship noise beyond the flat chance** (jams, shuffles from incidents): incident points are too low early, when research sabotage matters.
- **Sabotage for projects and PILGRED.**
