# Plan: research samples, assays and sabotage (written 2026-10-30)

How a Mush sabotages research without being caught by bookkeeping, built on the relay token system of `docs/plans/relay-tokens.md`. Built 2026-10-31 (#311 part B). Players see a research's relay tokens as **samples**, and an **assay** tests a research's pending samples. "Relay tokens" is the name behind the scenes (code and docs); "sample" and "assay" are the words players see. **Decisions** are the owner's; **Proposed** items are Claude's and need the owner's confirmation before they are built; **Open questions** block the part they belong to. Do not guess them.

## The problem

Research is where the lab Mush characters (Finola, Ian) are expected to spend their time, and the lab is where the crew usually installs a camera, which reveals covert actions. A lab Mush has no sabotage that works there, so playing one is mostly playing a human. Sabotage needs to hide inside the research action itself, and leave the crew with suspicion, never proof: if spoiled work can be traced to one player by elimination (everyone reports what they did), a careful crew rules the Mush out of nothing and in for everything.

Inspiration: Battlestar Galactica's skill checks (contributions go in face down, two random cards from the Destiny deck are mixed in, the pile is shuffled and revealed together, so a failure could always be random), plus a delay, so that by the time sabotage shows, many people have touched the bench.

## Decisions (owner, 2026-10-30)

- **Pending samples and assays.** A research sample lands as *pending*. An **assay** tests all of a research's pending samples together. Assays happen at the **quarter marks** (25, 50, 75 and 100%).
- **Spoiling.** At an assay, a contaminated sample spoils, and every other pending sample spoils with a **flat 5% chance** (the noise). A spoiled sample counts as zero.
- **Every Mush can spoil their own samples** (fake work that looks like a contribution).
- ~~A Mush skill lets its holder contaminate other players' pending tokens, and the holder picks which token.~~ Superseded 2026-10-31, see below.
- **Only people in the room see an assay's result** (which samples spoiled and whose they were).
- **Research only.** Projects and PILGRED use the pool (`docs/plans/relay-tokens.md`) but have no pending stage and no sabotage for now.
- ~~Word: "breakthrough", not "assay".~~ Superseded 2026-10-31: "sample" and "assay".
- **The sample list is the evidence, seen only in the lab.** Anyone in the lab sees a research's samples, verified and pending, each with the contributor's face and its value (values reveal skill bonuses; accepted). Nobody elsewhere sees them.
- **Research becomes a private action:** no room log line when someone contributes. The sample list and the assay lines are the record of who worked.
- **Pace:** no retune of `rate` or `relayPenalty` before building. The owner expects the gain from optimal pooling to be offset by contamination; watch it in playtests.
- **No grid for now.** The hex grid and player rearrangement (below, "Deferred") are not part of this pass.

## Decisions (owner, 2026-10-31; from the owner's public proposal)

- **Words:** players see a research's relay tokens as **samples**, and the test is an **assay**. Replaces "token" (still the name behind the scenes) and "breakthrough" as player-facing words: "token" sounded boring, and "breakthrough" like good news even when it spoils work.
- **Saboteur (`sapper`) is the contaminating skill.** Every Mush can spoil only their own samples; Saboteur also lets its holder contaminate other players' samples. Its action sits next to Participate at the research terminal and contaminates a pending sample made by someone else that isn't already contaminated. The holder does not pick. **Other Mush are included**: a preference by role could reveal someone's role. It is **private, not covert** (unlike Sabotage), so a camera doesn't see it. Nothing changes until the assay. **No daily limit** (owner, 2026-10-31: the AP cost keeps it fair). **Cost: 1 AP**, reusing Sabotage's cost (eMushpedia, [Saboteur](https://fr.emushpedia.com/wiki/Saboteur): "1 PA Saboter"; in eMush Saboteur itself is passive and triples equipment sabotage's success chance).
- **Saboteur prefers the smallest contributors** (owner, 2026-10-31, replacing "no preference, random"): among the eligible samples, it contaminates one whose contributor has contributed the least to that research. That is usually the sample whose loss costs the most, since it is what separates other players' runs (worked example below). The preference is by contribution, never by role. **"Least" counts samples** (owner, 2026-10-31), not their value: the fewest samples is where a spoil does the most damage to other players' runs. The owner accepts, and likes, that this makes light contributors look more suspicious in the assay lines.
- **Own spoil** is a second button next to Participate that only Mush see, at the same cost. Until the assay it looks like a normal contribution.
- **A spoiled sample is removed as if it had never been made**, so progress drops, and it no longer separates anyone's run (worked example below).
- **Samples that pass are verified and can never spoil.** Progress never drops below the last assay.
- **Short of the mark.** If spoils pull progress back under the mark, the assay happens again the next time progress gets there.
- **Completion.** A research only finishes when the 100% assay leaves it at 100%.
- **The assay line** (lab room log, i18n en/fr/es) names everyone tested, with counts, and whose samples spoiled: "MycoAlarm assay: 6 samples tested (Chun ×3, Paola ×2, Finola ×1), 1 spoiled (Paola's)." It never says why a sample spoiled. It stays in the lab's log like any other line, so anyone who comes to the lab later can read it.
- **The progress bar:** solid for verified progress, striped for pending; hovering the bar shows the exact numbers.
- **Research progress is visible only to living players in the lab**, verified and pending alike. Elsewhere on the ship nobody sees a research's progress; the only research news that reaches other rooms is its completion. This replaces today's public research progress.
- **Participate's percentage** is how much the research goes up if you contribute now (see `docs/plans/relay-tokens.md`).
- **The help text** gets one sentence: "Your contributions only lose value when you've made more than everyone else combined, plus one."
- **Tuning:** 5% and the quarter marks are first guesses.
- **Which samples count toward "least":** all of the contributor's samples in that research, verified and pending, since the separator effect depends on the whole pool. A tie is broken by the seeded RNG (Claude's proposal, confirmed).
- **No Mush bots** use own spoil or Saboteur: single player makes the human player the Mush, and multiplayer has no bots (owner, 2026-10-31). Crew bots only contribute honestly.

## Confirmed (Claude's proposals of 2026-10-30, confirmed by the owner 2026-10-31)

- **Verified and pending pools.** Research progress is the best arrangement (`docs/plans/relay-tokens.md`) of the **verified** samples only. The striped segment is the best arrangement of verified plus pending, minus verified progress.
- **The trigger.** An assay runs when the striped total reaches the first quarter mark above verified progress. Survivors join the verified pool and the pool is rearranged.
- **Verified progress never falls.** Spoils only remove pending samples and adding samples never lowers the best arrangement, so `relay-tokens.md`'s "progress never falls" holds for verified progress, and completion side effects stay safe.
- **Completion side effects** run at the assay that completes the research: the Mush sample item is consumed and the MycoAlarm drops then, not when the striped bar reaches 100.
- **Completion lines stay public** ("MycoAlarms built", the serum on the floor): they announce things in the room, not who worked. `researchCompleted` no longer names anyone.

## Built with it (Claude, 2026-10-31; flagged to the owner, not asked)

- **Contaminate with nothing left to hit.** It is offered whenever someone else has a pending sample, and does nothing (the AP is spent, the private line is the same) when all of those are already contaminated. Offering it only for uncontaminated samples would let a Saboteur learn that another player's sample was spoiled by its maker, so that player is Mush (Mush don't see each other's roles).
- **Own spoil and Contaminate are recorded under their own names** (owner, 2026-10-31): Interrogate and Chitchat may reveal them, as with Extract spore; they leak by design (`rules-design.md`). Until the assay, own spoil looks like Participate everywhere else.
- **Contaminate's private line** says the Saboteur tampered with the research's samples, not whose.

### Worked example

Base 6, penalty 2, minimum rolls. Verified pool is empty. Pending: Chun ×3, Paola ×1 (in any order).

- All pass: best arrangement Chun Paola Chun Chun → 6 + 6 + 6 + 4 = 22.
- Paola's sample spoils: Chun Chun Chun → 6 + 4 + 2 = 12. Paola's sample was worth 6, but losing it cost 10, because Chun's samples lost their separator.

## State and code

- `RelayPool` for research gains `pending: RelayToken[]` (shown to players as samples); each research token gains `contaminated: boolean`, and the state records who contaminated it (`contaminatedBy`, for the replay and the history; never in a view).
- `config.research.spoilChance: 0.05`. The noise rolls are drawn at the assay from the seeded RNG, one per pending sample, in sample order, so a replay reproduces them. Any tie in Saboteur's target choice is broken by the seeded RNG too.
- `assay(state, research)` in `shared/src` (pure): rolls spoils, moves survivors to the verified pool, drops the rest, writes the room log line, runs completion. Called from the research action when the trigger is reached.
- Views: for a viewer in the lab only, each research's verified progress, striped pending total and sample list (verified and pending, with contributor and value). Elsewhere: no research progress, only whether a research is complete. Never sent: `contaminated`, `contaminatedBy`, the spoil rolls, and whether a spoil was noise or contamination.
- `research.ts`: visibility `private`, and the `researched` / `researchCompleted` room lines go (completion's item lines stay).

## Leak check

- The cause of a spoil (noise or a Mush) must not be derivable from any view, log line or timing. The line is identical either way.
- Contaminating is private: no log line, no camera, no change in any other player's view before the assay. Saboteur's target depends only on contribution counts that anyone in the lab can see, never on roles.
- Research progress and the sample list go only to viewers in the lab. Sample values reveal the skill bonuses of contributors who are not there (the owner accepted this).
- Run `leak-check` when this is built.

## Tests

- An assay fires exactly at each quarter mark, re-fires at the same mark after spoils leave it short, and the 100% one completes the research only if verified progress reaches 100.
- A contaminated sample always spoils; others spoil at 5% (seeded); a spoiled sample leaves the pool, including the separator effect in the worked example.
- Verified progress never falls across any sequence of contributions and assays.
- Own spoil: every other player's view, including the lab's sample list, is identical to an honest contribution's until the assay.
- Contamination: no view or log changes before the assay; the target is never the Saboteur's own sample or an already contaminated one, can be another Mush's, and is always by a contributor with the least contribution among the eligible ones; the assay line is identical for noise and contamination.
- Lab-only visibility of research progress, the striped total, the sample list and the assay line; outside the lab only completion; no log line for a contribution.
- Replay: the same seed and actions give the same spoils and the same Saboteur targets.

## Open questions

None left.

## Deferred

- **Player rearrangement on a hex grid** (owner's idea, 2026-10-30): samples on hexes with the contributor's face and value, a path through the grid giving the order, adjacent swaps. Problems found: a free swap is busywork and makes scrambling free, an AP swap competes with contributing, a swap tied to contributing was suggested, and sample values reveal skills to people in other rooms. Kept for a later pass once assays have been played.
- **Ship noise beyond the flat chance** (jams, shuffles from incidents): incident points are too low early, when research sabotage matters.
- **Sabotage for projects and PILGRED.**
