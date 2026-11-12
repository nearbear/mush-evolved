# Balance review: a guide to tuning

**Status:** Claude's review, written 2026-11-10 at the owner's request, then fact-checked and edited on 2026-11-11 after the owner and a player read it. Every item is a recommendation unless it is marked **Decided**, and decisions still go through the `rule` skill and `docs/rules/rules-design.md`. "New mechanic" marks an idea that isn't in eMush. A human rewrite is planned.

**Sources:**

- `docs/plans/balance.md`, `docs/rules/rules-design.md`, `docs/rules/implemented-rules.md`, `docs/plans/research-sabotage.md`.
- eMushpedia pages "Triomphe", "Points de Moral", "Atteindre Eden", "Daedalus détruit" and "Les morts" (see "What eMush does").
- Nine community discussion threads the owner shared, digested at the end without names. Two contain the owner's own proposals.

**Terms:**

- **Mush and eMush.** Mush is Motion Twin's original game, whose assets are in `Mush/`. eMush is the open-source remake that eMushpedia documents, and every source here describes eMush. "The lead developer" and "the developers" are eMush's; "veterans" are its experienced players.
- **A passive Mush** never extracts a spore, or extracts only to eat it with Phagocytosis (the owner's definition). `balance.md`'s target table uses a stricter one: no spike, contamination, sabotage, spore food or Transfer.
- **The List** (not built): printed once per game by Eleesha's Tracker skill. It holds one starting Mush among random names, 8 names on day 1 and one fewer each day (`balance.md`, "The List").
- **Readings, forks and leaves** come from the False Eden draft in `balance.md`. The route to Eden is a tree. At each fork a crew member can take a private, noisy reading that names the right branch. The leaves are True Eden, False Eden and dead ends.
- **The sneaky Sol:** two quiet Mush repair PILGRED and fly home, Transferring into the Commander if they need to.

## Summary

1. eMush is stuck in a loop: the Mush's kill burst makes the crew lock down, research ends infection, and the Mush either lash out or hide. This ruleset inherits the loop.
2. The passive Mush wins by default. Making Eden a human win even with Mush alive fixes that, and should be decided first.
3. The crew can't count converts, so flying home to Sol is a gamble. Either accept that or give the crew a way to learn the count.
4. Wrong kills cost almost nothing, so killing a suspect and reading the death message is a cheap, repeatable test. `balance.md`'s "No mechanical testing" goal rules that out.
5. The Mush have no middle game between hiding and rampaging. Delayed, room-based infection is the best candidate.
6. Some detection tools give hard proof on their own. MycoScan is the strongest, and `balance.md` underrates it.
7. In False Eden the lie is also the tell. The deception belongs inside the mechanism, as in research sabotage.
8. A human certified from the first minute turns the investigation into one player's job. Decide what Chun is.
9. Settle structure before numbers. With dozens of games, not thousands, win rates can't do the tuning.

## The diagnosis

Veterans of eMush describe one loop:

1. The Mush's strongest tool is a burst of kills, so the crew locks everything down. Weapons go to one trusted player, cameras and alarms cover busy rooms, and nobody works on PILGRED or Eden while a Mush may be alive.
2. Research then shuts down infection within a day or two.
3. The Mush are left to lash out and die, or to hide and wait.
4. Both choices confirm the crew was right to lock down.

One player called the result "feast or famine": both Mush die having done nothing, or one early convert becomes a wave nobody can stop. A veteran called the Mush "too explosively powerful, yet not at the same time". The owner's summary: the Mush's long-term prospects are so poor that rampaging is the only incentive, "like watching a cornered animal lash out".

Balance work should aim to break this loop. A win rate is a late, noisy symptom of it.

### What makes it worse here

- **The passive Mush wins by default.** Humans win only by reaching Sol or Eden with no Mush alive, converts included (`rules-design.md`, 2026-10-22), and nothing tells them how many Mush are left. Nothing reaches Eden yet, so today Sol is the only human win. A destroyed ship and a dead crew are Mush wins, and there is no game length limit. Rations, morale, hunters and incidents are clocks on the humans only.
- **Wins are all or nothing.** eMush also scores each player's personal triumph. A Mush starts at 120 and loses 2 every cycle, so the score itself pushes it to act. A faction win has no such slope, so the outcomes the owner named, "die pathetically" and the sneaky Sol, hurt more here.
- **Hiding costs little when waiting wins.** `balance.md` says a passive Mush pays in AP: with no food AP it has less to spend on the visible work of its job, and low output is a soft tell (see "Food"). The cost is real, but it only matters if it gets the Mush caught. The problem is the payoff of waiting, not the price of hiding.

## Tests to apply to every change

- **Doing nothing loses, for both sides.** An unhindered crew reaches an ending before attrition kills it; an idle crew dies.
- **A veteran's three questions for any Mush change.** Does it help a cornered Mush without adding to the kill burst? Is it fair to play against? Does it keep the investigation's core clues intact over a long game?
- **Preventable in hindsight.** The lead developer: frustration stops feeling unfair when you could have prevented what happened. Every decisive play needs a window in which the other side could have acted.
- **No single detection gives hard proof.** A tool should narrow suspicion through delay, batching or noise, never name a Mush outright. Nightmarish breaks this: when it hits you, you know a roommate is Mush. The research assay is the model, where contamination shows up later, in batches, mixed with honest error.
- **Counter-measures are blind.** You pay and don't learn whether it mattered. Example: the owner's 1 AP "factory reset" for a hacked iTrackie never says whether it removed a hack.
- **No incidental proof, penalties included.** A buff or debuff a Mush can't have clears whoever shows it.
- **Certainty is earned, costly or temporary,** never free and permanent. The serum fits: it's scarce, and the cured player can be spiked again. A character certified from the first minute doesn't.
- **No rituals.** A counter that works only if everyone repeats a chore (saying "copy" to every order) punishes new players. Prefer counters that are one deliberate act.

## Structural decisions, in order

Settle these before tuning any number. Each one changes what the numbers mean.

### 1. Eden is a human win with Mush alive

**Problem.** Humans win only by reaching an ending with every Mush dead, so they stop all progress until then. Players report never seeing a crew look for star map fragments with a Mush alive, and say PILGRED and Eden are "held hostage".

**Recommendation.** Adopt the owner's proposal: reaching Eden is a human win even with Mush alive. The Mush then have to stop something, so "doing nothing loses" holds by construction and anti-passive research has no purpose. The tuning rule that follows: an unhindered crew reaches Eden before attrition kills it, and the Mush's job is to cause delay.

**Divergence.** eMush and this ruleset (2026-10-22) both count Eden as a human win only with no Mush aboard; eMush counts the cat too. This is the right place to diverge from both.

**To decide.** The earliest day Eden can be reached, since every other clock is tuned against it. Where the Mush can sabotage the Eden route without combat: projects, PILGRED and the calculator have no sabotage yet.

### 2. Leaving needs three keys and a countdown

**Problem.** One Commander ends the game, so a Mush Commander, or a Mush that Transfers into the Commander, wins instantly. With 16 seats and 2 Mush, a Mush starts with the title in about one game in eight.

**The proposal.** From the community, and liked by the lead developer: going to Sol or Eden needs keys from three title holders, inserted at the Command terminal, each ejected when its holder leaves the bridge. Its author wasn't aiming at rushes, which players say are rare, but at making it safe to repair PILGRED before the hunt is over. The owner added a countdown that any holder cancels by withdrawing their key.

**Recommendation.** Replace the current stopgap (one Commander, a 4-cycle countdown, kill the Commander to abort) with this. Withdrawing a key is a cleaner abort than a killing. For False Eden, the three holders argue over which leaf to jump to.

**To decide.**

- **What a Transfer does to an inserted key.** Without a rule, one Mush inserts a key, Transfers into another holder and inserts again. A Transfer needs both bodies in the same room, so this can all happen on the bridge. In eMush a Transfer resets both bodies' skills, a visible trace; here skills stay with the body and a Transfer is meant to leave as few signs as possible. Two answers:
  - **The key is withdrawn.** Simple, but a key popping out publicly announces a Transfer. Fine if that tell is wanted.
  - **The key remembers the mind that inserted it,** and one mind can have only one key in. This blocks the double insert with no public sign.
- **Which three titles.** One player collecting several titles is a risk.
- **Absent holders.** Titles already pass on after 24 hours of inactivity, which covers the worry players raised.
- **A Mush gain to go with it.** Players called the lock "a straight Mush nerf" on its own.

### 3. Give Sol an answer to how many are left

**Problem.** Death messages let the crew count the two starting Mush, but never the converts. The strongest Mush line is to convert one quiet player (three spikes, under a day of the faction's spores), die loudly, and let the crew fly home to a loss it couldn't have foreseen: the same "not a fun way to lose" as the sneaky Sol. Without the hidden convert, a plain rampage is only an expensive human win. A veteran estimated that eight dead humans and two dead Mush still leave enough crew to finish PILGRED.

**Recommendation.** Either accept Sol as a gamble and say so in the rules text, or add one scarce instrument, like the List, that gives the count but never names anyone. It should be a day out of date and open to sabotage. New mechanic.

The owner and a player favor the instrument (2026-11-11). It tells the crew when to stop hunting and when Sol is safe, but it doesn't make a wrong kill cost anything: told "one left", a crew may still kill its way down three names. Design it together with decision 4.

### 4. Make a wrong kill cost the crew, quietly

**Problem.** A punch costs 1 AP and there are 14 humans, so a suspect dies within minutes of the crew coming online, and the death message gives the answer. `balance.md`'s pillar "Mistaken kills will cost something" has nothing behind it yet: reaching 0 morale does nothing.

**What eMush players say.**

- The habit of "if it's a Mush, good; if it's a human, oops" is common and resented.
- A crew is "fine with six deaths" unless it wants Eden.
- A certified human can kill alone with almost no consequence.
- A penalty on the killer must not out a Mush. In eMush a Mush's morale is fixed at maximum, so a Mush would have to fake any morale or sickness penalty, and showing one clears a human.
- Punishing the killer hard breeds toxicity. The lead developer's view: the point is to send a message, so a line at the moment of the kill matters more than the size of the penalty.
- A reward for killing a Mush was rejected: humans already gain enough from it.
- eMush's community has a norm against killing on your own judgment. A public queue of strangers won't have it, so the mechanics must carry it.

**Recommendation.**

- **Start with eMush's costs:** every crew death costs everyone 1 morale, and 0 morale is fatal at the next cycle.
- **Make Eden need hands.** The readings model already shows that turnout matters as much as accuracy, so every human life is worth something without a new rule.
- **No visible penalty on the killer;** a private line at the moment of the kill instead.
- **Consider an autopsy** in place of the automatic role reveal: a deliberate act on the corpse, which would also give the secret corpse jettison a purpose. New mechanic.

**To decide.** Whether a Mush has working morale here. Conversion keeps the morale value today; if Mush were immune to morale loss, every morale cost would become a tell.

### 5. Give the Mush a middle game

**Problem.** Players describe direct spiking as nearly impossible against a watchful crew, sabotage as "just outing yourself", and the choice as "infection or rampage, nothing in between". Going from two Mush to three is called a massive jump, which is why an early convert decides games.

**Ideas the developers liked best,** all delayed and tied to a room:

- **Auto-spike:** for 1 AP, a stance that spikes the first person to enter the room. Praised because it rewards asynchronous play, not whoever is online most.
- **A hidden mold** (the lead developer's own sketch): planted on a room's shelf for 0 AP and a spore. It grows for 8 cycles, can fall sick, then traps the room at each day change. A search finds it and 1 AP destroys it; the alarm rings only when it is planted.
- **Infected plants** whose fruit carries a spore half the time.
- **A delayed spore** that activates later, on a trigger.
- **Lab accidents:** a spore risk that rises with the research done that day. It taxes a research rush in the game's own fiction and creates contamination no Mush caused, which muddies tracing.

**Recommendation.** Build from this list before space boarders. These fit the "clues, luck and counterplay" pillar and suit asynchronous play.

**Survival skills take the slots.** Players say three of a Mush's four skill slots go to survival (anonymity, spore AP, water resistance, cheap extraction), so other skills are rarely picked. Research is why: it forces the choice between rampage and silence, so Mush fill their slots with skills that keep spores coming despite it (Mycelium Spirit, Fertile) instead of skills that spread them. The developers' rule that "a skill that only handles one research will never be worth a slot" is about narrow counters, such as hiding spores from the scanner. Broad survival skills have the opposite problem: they are always worth a slot. `balance.md` counts the slot as a brake on Phagocytosis; it is also a tax on variety. Consider giving every Mush a weak built-in version of each survival skill, with the skill as an upgrade.

**Decided (owner, 2026-11-11; not built).** Fertile is every Mush's default and no longer a pickable skill (`rules-design.md`, "Fertile for every Mush"). A free Mycelium Spirit for converts was also raised and is not decided. Most Mush already pick it, so a free one mostly frees a slot, but every convert would raise the faction's daily spores without choosing to, which tightens the jump from two Mush to three.

**Rejected by eMush's developers, for good reasons.** Skills that hide spores from the scanner (a counter to one research), infection that ignores witnesses and cameras, and anything that makes Interrogate reveal nothing.

### 6. Audit the detection tools

**Problem.** Players call anything that catches a Mush doing Mush things "surveillance", and say that once the alarms are out a Mush can't act without outing itself. One called a detectable skill "either busted or literally unusable". `balance.md` lists "graded effects, not off switches" as a lever, but no built tool has been checked against it.

- **MycoScan** is stronger than `balance.md` says. It reads only your own spore level, but a free daily check lets a human spot a new spore, place it in time and name the few people they were alone with. Players describe a target sitting at two spores twice in one game and never converting. Add noise, a cost or a delay.
- **Myco alarms** ring at once, every time, and with the room log that identifies the Mush by elimination. Consider one report per cycle ("spores were detected here this cycle") or a false ring rate.
- **Fix tools one at a time.** A veteran's warning: slowing all research makes a few players specialize harder and changes nothing else. The same player named the scanner and spore removal as the real problems.

### 7. False Eden: hide the lie in the mechanism

**Problem.** As drafted, the deception is all in open claims about readings.

- A Mush only matters by dissenting at the one fork where the True and False Eden paths split. With 14 honest readers at 80% accuracy, that is about three honest dissenters plus two Mush: a small group to outvote or kill.
- `balance.md`'s reading model confirms it: at that accuracy, with everyone reading, the crew picks True Eden 97 times in 100. False Eden wins mainly through whoever controls the jump.
- A dead end costs only the countdown, so a crew with no information can try every leaf and still find True Eden before False Eden half the time.
- The first-pass tree (one or two forks) has no stretch where a Mush reads honestly to build credit.

**Recommendation.**

- Let a Mush covertly bias other players' readings, as contaminated samples do in research. Honest readers then carry the lie, and dissent stops being a tell.
- Make the first test tree at least three forks deep on the true path, with the split at a random depth.
- Give a failed jump a real cost (fuel, a PILGRED recharge, or hunters following), not only time.
- Use the three keys for the choice of leaf.

### 8. Set the burst ceiling on purpose

**Problem.** The faction's daily cap of 4 spores limited the rate, not the stockpile. Phagocytosis turns each spore into 4 AP for 0 AP, so three quiet days banked 12 spores: 48 AP on top of a full bar of 12, about 60 AP in one sitting. A knife costs 1 AP, hits 60% of the time for 1 to 5 and never runs out, so on paper a kill costs about 8 AP.

**Decided (owner, 2026-11-10; built).** A Mush holds at most 2 spores (`config.spores.max`): extraction is refused at the limit, and spending a spore frees the slot. With Phagocytosis the bank is worth at most 8 AP and 8 HP, so a cash in is a full bar plus 8 AP, not 48.

**Recommendation.** Write down the intended size of a cash in (spending the whole bank in one sitting). Keep the weapon requirement: the lead developer noted that rampages became far less hated once they needed weapons and a plan, not one skill and a fist. Keep the tension that every spore eaten is a spike not made.

**The hunted Mush.** "A hunted Mush is fun to play" has no mechanism yet. An outed Mush needs stored potential to trigger (traps, primed victims, a mold) and somewhere to go. Decision 5 supplies the first.

### 9. Decide what Chun is

**Problem.** The docs disagree. `balance.md` says Chun can't be Mush. `rules-design.md` (2026-10-18) says she is immune to infection but "can still be a Mush from the start". Either way, the List "can never contain Chun".

**What a certified human does to the game,** from a long community argument:

- Telling Chun is free and telling anyone else is a gamble, so players stop talking to each other. The crew becomes a set of private channels to one player.
- Everyone else turns passive ("I only do my character's job"). A new player sees a ship maintenance game, not social deduction.
- Chun is a bottleneck with a real-life schedule. If she sleeps the hunt stalls; if she dies, her information and hidden items die with her.
- She opens every game by running a checklist: collect the weapons and sensitive items, hide the alarms.
- She is the scapegoat for every failure, and one of the last characters picked.
- Other games avoid this: the informed player must hide (Avalon), information is unreliable (Blood on the Clocktower), or nobody is confirmed at all.

**Options raised.**

| Option | Effect | Cost |
|---|---|---|
| Immune to infection, can start as Mush (the `rules-design.md` entry) | A nonzero chance is enough to end blind trust; keeps the immunity | A Mush Chun can't be on the List, and can stall the research that needs her in the lab |
| Resistance: one or two more spores than others | Chun can be converted like anyone, slowly | Loses the iconic trait, which players are attached to |
| Keep full certainty, make her unreliable (the owner's idea: forced Lethargy, unreachable for 4 cycles) | Lowers what the crew expects of her | Makes her less attractive to play |
| Keep certainty, make talking to her risky (the owner's Radio Pirate rework) | A Mush may be listening to her channels | "Busted or unusable", depending on the tell |

**Recommendation.** Keep the `rules-design.md` entry: immune to infection, able to start as Mush. It is already decided, it is the smallest change, and in the thread the owner said the chance "just needs to be non-zero". Then fix `balance.md`'s pillar text, and decide whether a Mush Chun can appear on the List.

**Related.** Any other free, permanent certainty has the same effect. The serum is fine because it is scarce and a later spike can undo it.

## Numbers, after the structure

| Knob | Today | Suggestion | Why |
|---|---|---|---|
| Starting rations | 32 | Trial 24 | See "Food" |
| AP per ration | 4 (5 with Sirius) | Keep | Argued down by eMush players: the walk costs about 1 AP, so people hoard and eat more |
| Rations eaten in pre-selection | Unlimited | Decide a limit | Late joiners inherit an emptied refectory |
| Spores a Mush can hold | 2 (decided 2026-11-10) | Done | Burst ceiling |
| Earliest Eden arrival | Undecided | Pick the day first | Every other clock is tuned against it |
| Detection research | Flat pace | Pace back from a target day | Already a lever in `balance.md` |
| Two Mush from how many players | 9 or more | Consider 10 or more, counting active players | A 9-seat ship with two inactive players played as 5 against 2 |
| Selection threshold | None | Hold selection until enough players are active | Understaffed ships are where the Mush snowball |

### Food

- **Size.** 32 rations at 4 AP is 128 AP. Fourteen humans regenerate 112 AP a day between them, so the refectory holds a little more than one extra crew-day.
- **Shape.** It is a burst, not a trickle. Players say the lab spends most of it in the first two days and call it the engine of the research rush ("three researches by the middle of day 2").
- **As a clue.** Low output is a real soft tell for characters whose work is visible, and a weak one for everyone else. A veteran called AP limitation "a core pillar of the investigation".
- **As a clock.** It isn't one. With 32 rations, crews in eMush never starve ("not since 2013"), and the first expedition leaves on day 2 at the median (1.9 days on the French server, 2.2 English, 2.5 Spanish, counted from ship creation). If rations are meant to run out, there are too many.
- **Side effects of fewer rations.** A Mush eating to drain the supply becomes a real play, as the owner intends, and so does cooking away the stock. Fewer chances to get dirty by cooking. A slight nerf to Fungal cuisine.

## The clocks, side by side

From the config numbers; the arithmetic is Claude's.

| Clock | Favors | Bites around | How it was worked out |
|---|---|---|---|
| Conversion majority | Mush | Day 6 at best; day 8 after the Mush-eating bacteria research | 4 spores a day, 3 per convert (4 after the research); 2 Mush need 7 converts of 14 humans, with no spore eaten and nobody dead |
| The List names a starting Mush | Humans | Day 7, if printed that late | 8 names, one fewer per day |
| Starvation | Mush | Day 11 | 24 cycles of grace, then 28 cycles per ration at 2.3 rations each; sooner for every ration eaten for AP |
| Morale at 0 | Mush, once built | Day 7; day 4 without Chun | Start 7, minus 1 a day with Chun alive, 2 without |
| Hunters and incidents | Mush | Not tuned | Both grow by day |
| Eden and Sol arrival | Humans | Undecided | |

Conversion is slow. A Mush majority by conversion alone is close to impossible, so in practice the NERON majority rule will be reached through kills.

## Measuring with few games

Sixteen players over several days means dozens of games, not thousands. Thirty games give a win rate within about 18 points either way, and conditional targets such as "Mush win rate given two conversions by day 2" will have no sample at all. "A real path to winning on the final day" can't be computed from a record.

- **Turn the invariants into headless tests.** Passive Mush lose. An unhindered crew reaches Eden by its target day. The fastest conversion majority lands where the table says.
- **Ask one question after each game:** "Did your side still have a real chance on the last day?" Closeness is a perception.
- **Use 1-hour cycles** for volume.
- **Count leading indicators, not wins:** the day of the first hostile act, the day of the first wrong kill, how many players were alive at the end, and how much work went into PILGRED and Eden while a Mush was alive.

The last indicator measures the loop directly. If crews work on the endings with Mush alive, the stalemate is broken.

## Memorable games

- **A personal score on the end screen.** eMush's triumph gives an outed Mush, a convert and the dead something to play for. It can sit beside the faction result without replacing it.
- **Replays.** eMush players ask for them, and its developers say the data isn't stored. This project already records every input, so a short highlight reel at the end (first spike, who converted whom, the closest call) is cheap, and it is where the story gets told.
- **Reasons to move around.** A veteran's view of where eMush should go next: make more rooms matter and give everyone reasons to walk. Room-based infection (decision 5) does both.

## Not worth doing now

- **Space boarders.** Expeditions already give a reason to carry weapons, and it is a whole new system.
- **Anti-passive research.** Decision 1 replaces it.
- **A visible debuff on killers.** It clears them as human.
- **Slowing all research across the board.**
- **Cutting AP per ration.**
- **AP from food for Mush, paid out gradually** (the owner's "Metabolism" idea). A veteran objected that it feeds preparation for a rampage and removes a core clue. This ruleset's answer (no AP, the same full belly) is better.

## What eMush does

Checked on eMushpedia on 2026-11-10. These describe eMush, not this game.

- **Triumph** ("Triomphe"): the score is personal. Humans gain 1 per cycle survived, plus character goals. Mush start at 120, lose 2 per cycle, and gain 8 for completing a conversion, 3 for killing a human, 7 if Chun dies and 16 if every living player is converted.
- **Morale** ("Points de Moral"): start 7, cap 14. At 0 the character kills themself at the next cycle change. A crew member's death costs everyone 1, except after a suicide, a trade or a quarantine. The daily loss is 2, less 1 while Chun lives. A Mush's morale is always at maximum.
- **Eden** ("Atteindre Eden"): three star map fragments, the Super Calculator research, then a 33% calculation for 2 AP per fragment, then the jump with PILGRED repaired. It counts as a human victory only with no Mush aboard, the cat included. The page calls it the hardest ending to get.
- **A destroyed ship** ("Daedalus détruit"): "can be considered a Mush victory if there was active sabotage. Some players consider it a draw."
- **NERON** ("Les morts"): kills everyone when only Mush remain at a cycle change. The majority rule decided here triggers earlier.

## Thread digests

What each shared thread contributed, so the reasoning above can be checked.

### Radio Pirate rework (the owner's proposal)

At the comms center, 3 AP, private, once a day, one target at a time: the hacker reads the target's channels and can speak as them, and the target never sees the spoofed messages. A 1 AP "factory reset" clears any hack without saying whether there was one. The aim was to make talking to Chun risky, so other investigators get used.

Objections: reading private channels with no risk is too strong; any tell makes the hacker traceable by AP counting; alarms on the bridge would kill it; it would spawn rituals; it makes Chun worse to play. Used here for the tests "Counter-measures are blind" and "No rituals", and for decision 9.

### The three-key PILGRED lock

Summarized under decision 2. Also raised: PILGRED rushes are rare, and the real issue is that PILGRED goes untouched; the repair could be split into stages that favor different skills; and one veteran argued the lock only works alongside changes that weaken the rampage and strengthen infection and sabotage after the first research wave.

### Mush skill ideas (French)

A long brainstorm, mostly one player's, with developer reactions; summarized under decisions 5 and 6. Ideas that got little support: a dead alpha's spores staying in the room, a once-per-game mass infection, spores hidden from the scanner, a spore cloud, team-only versions of existing skills, and Mush bonuses bought when a research completes. The "one research, never worth a slot" rule comes from here (see decision 5).

### Consequences for killing a human

Summarized under decision 4.

### A Mush flying off with key items

A Mush takes the research items, leaves in a ship and is lost with them. Players find it unfair because nothing can be done about it, and developers note it rarely helps the Mush win. The consensus was to let turrets shoot the ship. Used here for the test "Preventable in hindsight". The same play should be checked against this ruleset's patrol ships.

### Start with fewer rations

Summarized under "Food". The thread settled around 24, with some wanting a trial at 16. Lowering AP per ration, and a research that restores it, were both argued down.

### AP from food and the long game (the owner's proposal)

The owner proposed paying ration AP out over several cycles and cancelling it on any aggressive act, so a Mush could eat. A veteran's reply gave the three questions and the description of the loop used in the diagnosis. The owner's reply named the missing piece: something that puts the Mush "on the clock". Decision 1 is that clock. The same thread raised a lobby threshold for understaffed ships, and the owner's idea of replacing inactive players with single-purpose androids bought from traders.

### Chun and immunity

Summarized under decision 9. The lore argument (her status and a database entry say immune; her biography doesn't) matters less than the split it showed: players are attached to the trait, and most of eMush's decision-makers want to keep it.

### Transfer and the dead

In eMush, a Transfer needs the same room and one spore, leaves no log, and resets both bodies' skills. Here it leaves no trace. The same thread showed a dead player talking about a live game in public, the out-of-game coordination problem `balance.md` already lists.

## Corrections and gaps

- **Corrected (2026-11-10):** the food gap, which an earlier pass called negligible (see "Food"); `balance.md`'s "MycoScan is not a test" (decision 6).
- **Corrected (2026-11-11):** the human win conditions (Eden counts too), one player's quote presented as what "players call" it, the definition of a passive Mush, and the skill-slot test (decision 5).
- **Not checked:** whether eMush's death message reveals the role.
- **Not checked:** how patrol-ship flight with stolen items plays in this ruleset.
- **Not modelled:** the readings game with AP budgets, converts arriving mid-game, and a crew that discounts suspects.

## Questions for the owner

1. Is Eden a human win with Mush alive? If so, what is the earliest day it can be reached?
2. Three keys and a countdown in place of the single Commander? What does a Transfer do to a key?
3. Is Sol a gamble by design, or does the crew get a count? (The owner and a player lean toward a count, 2026-11-11.)
4. What does a wrong kill cost, and does a Mush feel morale?
5. Which delayed infection comes first?
6. What changes on MycoScan and the alarms?
7. Can Chun start as Mush, and can she be on the List?
8. ~~How many spores can a Mush hold?~~ Two (owner, 2026-11-10).
9. Starting rations: 32 or 24?
