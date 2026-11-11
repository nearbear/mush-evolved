# Balance review: a guide to tuning

**Status:** Claude's review, 2026-11-10, written at the owner's request and expanded the same day. Everything here is a recommendation. Nothing is a decided rule; each item still goes through the `rule` skill and `docs/rules/rules-design.md`. Ideas marked "new mechanic" are not in the original game.

**Sources:**

- `docs/plans/balance.md`, `docs/rules/rules-design.md`, `docs/rules/implemented-rules.md`, `docs/plans/research-sabotage.md`.
- eMushpedia pages "Triomphe", "Points de Moral", "Atteindre Eden", "Daedalus détruit" and "Les morts" (facts listed under "What the original does").
- Nine community discussion threads the owner shared, digested at the end with no names. Two of them contain the owner's own proposals.

## Summary

1. The original game is stuck in a loop: the Mush's kill burst makes the crew lock down, research then ends infection, and the Mush either lash out or hide. This ruleset inherits the loop.
2. Under today's win conditions the passive Mush wins by default. Eden as a human win with Mush alive is the fix and should be decided first.
3. Sol has no answer to converts, so it is a trap ending unless the crew gets a way to learn the count.
4. Killing a suspect and reading the death message is the cheap, repeatable test the goals forbid. Its cost is not designed yet.
5. The Mush have no middle game between hiding and rampaging. Delayed, room-based infection is the best candidate.
6. Detection tools are off switches today. MycoScan is the strongest of them, and `balance.md` underrates it.
7. False Eden's lie is also its tell. The deception belongs inside the mechanism, as in research sabotage.
8. A certified human from minute one turns the investigation into one player's job. Decide what Chun is.
9. Settle structure before numbers. With dozens of games, not thousands, win rates cannot do the tuning.

## The diagnosis

Veteran players of the original describe one loop:

1. The Mush's strongest tool is a burst of kills, so the crew locks everything down. Weapons go to one trusted player, cameras and alarms cover busy rooms, and nobody works on PILGRED or Eden while a Mush may be alive.
2. Research then shuts down infection within a day or two.
3. The Mush are left to lash out and die, or to hide and wait.
4. Both choices confirm the crew was right to lock down.

Players call the result "feast or famine": both Mush die having done nothing, or one early convert becomes a wave nobody can stop. One veteran's phrase for the Mush was "too explosively powerful, yet not at the same time". The owner's own summary in one thread was that long-term prospects for the Mush are so poor that rampages are the incentive, "like watching a cornered animal lash out".

Balance work should aim at breaking this loop. A win rate is a late, noisy symptom of it.

### What makes it worse here

- **The passive Mush wins by default.** The humans' only win is Sol with no Mush alive, converts included, and nothing tells them the count. A destroyed ship and a dead crew are both Mush wins. There is no game length limit. Rations, morale, hunters and incidents are clocks on humans only.
- **Wins are all or nothing.** The original scores personal triumph. A Mush's score starts at 120 and falls by 2 every cycle, so its pressure to act is built into the score. A faction win has no such slope, which is why "die pathetically" and the sneaky Sol hurt more here.
- **The stated price of stealth is not a price.** `balance.md` says a passive Mush pays in AP. A passive Mush has nothing to spend AP on. What it lacks is a reason to act.

## Tests to apply to every change

- **Doing nothing loses, for both sides.** An unhindered crew reaches an ending before attrition kills it. An idle crew dies.
- **Three questions for any Mush change** (a veteran's checklist). Does it help a cornered Mush without adding to the kill burst? Is it fair to play against? Does it leave the investigation's core clues intact over a long game?
- **Preventable in hindsight.** The original's lead developer: frustration stops feeling unfair when you could have prevented what happened. Every decisive play needs a window in which the other side could have acted.
- **Detection is graded.** Delay, batches and noise, never an off switch. The research assay is the model.
- **Counter-measures are blind.** You pay, and you don't learn whether it mattered. The owner's "factory reset" for a hacked iTrackie is the example: 1 AP, and no word on whether a hack was removed.
- **No incidental proof, penalties included.** A debuff or a buff that a Mush can't have clears whoever shows it.
- **Certainty is earned, costly or temporary.** Never free and permanent. The serum fits (scarce, and the cured player can be spiked again). A character certified from the first minute does not.
- **A skill earns its slot in most games.** With four Mush slots, a skill that answers one research never gets picked.
- **No rituals.** A counter that works only if everyone repeats a chore (saying "copy" to every order) punishes new players. Prefer counters that are one deliberate act.

## Structural decisions, in order

Settle these before tuning any number. Each one changes what the numbers mean.

### 1. Eden is a human win with Mush alive

**Problem.** Humans can only win by going home with every Mush dead, so they stop all progress until then. Players report never seeing a crew look for star map fragments with a Mush alive, and call PILGRED and Eden "held hostage".

**Recommendation.** Adopt the owner's proposal. Once Eden is safe to reach, the Mush have to stop something, and "doing nothing loses" holds by construction. The tuning rule that follows: an unhindered crew must reach Eden before attrition kills it, and the Mush's job is to create the delay. Anti-passive research then has no purpose.

**Divergence.** In the original, Eden only counts for humans with no Mush aboard, the cat included. This is the right place to diverge.

**To decide.** The earliest day Eden can be reached. Every other clock is tuned against it. Also where the Mush can sabotage the Eden route without combat: projects, PILGRED and the calculator have no sabotage yet.

### 2. Leaving needs three keys and a countdown

**Problem.** One Commander ends the game. A Mush Commander, or a Transfer into the Commander, is an instant win. With 16 seats and 2 Mush, a Mush holds the title from the start in about one game in eight.

**The community proposal,** liked by the original's lead developer: Sol or Eden needs keys from three title holders, inserted at the Command terminal, each ejected when its holder leaves the bridge. Its author's point was that it is not about stopping rushes, which players say are rare. It is about making it safe to repair PILGRED before the hunt is over. The owner added a countdown that any holder cancels by withdrawing a key.

**Recommendation.** Prefer this to the current stopgap (one Commander, a 4-cycle countdown, killing the Commander to abort). Withdrawing a key is a cleaner abort than a killing. For False Eden, three holders argue over the leaf.

**To decide.**

- What a Transfer does to an inserted key. Otherwise one Mush inserts, transfers into another holder and inserts again. Here a Transfer leaves no trace at all (upstream both bodies lose their skills), so it is stronger than the original's.
- Which three titles. One player collecting several titles is a risk.
- Absent holders. Titles already pass on after 24 hours of inactivity, which covers the worry players raised.
- Whether the lock should be paired with a Mush gain. Players called it "a straight Mush nerf" on its own.

### 3. Give Sol an answer to how many are left

**Problem.** The crew can count the two starting Mush from death messages. It can never count converts. The best Mush line is to convert one quiet player (three spikes, under a day of the faction's spores), then die loudly, and let the crew fly home to a loss it could not have foreseen. That is the same "not a fun way to lose" as the sneaky PILGRED. A veteran's estimate of a plain rampage: eight dead humans and two dead Mush still leaves enough crew to finish PILGRED, so without the hidden convert it is only an expensive human win.

**Recommendation.** Either accept Sol as the gamble ending and say so in the rules text, or add one scarce instrument on the List pattern that answers the count and never the identity. It should be a day stale and open to sabotage. New mechanic.

### 4. Make a wrong kill cost the crew, quietly

**Problem.** A punch costs 1 AP and there are 14 humans, so a suspect dies within minutes of the crew being online, and the death message gives the answer. "Mistaken kills will cost something" is a pillar with nothing behind it yet: 0 morale does nothing.

**What players of the original say.**

- The "if it's a Mush, good; if it's a human, oops" habit is common and resented.
- A crew is "fine with six deaths" unless it wants Eden.
- A certified human can kill alone with almost no consequence.
- A penalty on the killer must not out a Mush. Upstream a Mush's morale is fixed at maximum, so any morale or sickness penalty is something a Mush would have to fake, and showing it clears a human.
- Punishing the killer hard breeds toxicity. The lead developer's view was that the point is to send a message: a visible line at the moment of the kill matters more than the size of the penalty.
- A reward for killing a Mush was rejected: humans already gain enough from it.
- The original's community also has a rule against acting on your own opinion. A public queue of strangers will not have that norm, so mechanics must carry it.

**Recommendation.**

- **Use the original's costs first:** every crew death costs everyone 1 morale, and 0 morale is fatal at the next cycle.
- **Let Eden need hands.** The readings model already shows turnout matters as much as accuracy, which makes every human life worth something without a new rule.
- **Avoid a visible penalty on the killer.** Use a private line at the moment of the kill.
- **Consider an autopsy** in place of the automatic role reveal: a deliberate act on the corpse, which would give the secret corpse jettison a purpose. New mechanic.

**To decide.** Whether a Mush has working morale here. Conversion keeps the morale value today; if a Mush is immune to morale loss, every morale cost becomes a tell.

### 5. Give the Mush a middle game

**Problem.** Players describe direct spiking as nearly impossible against a watchful crew, sabotage as "just outing yourself", and the choice as "infection or rampage, nothing in between". The jump from two Mush to three is called massive, which is why an early convert decides games.

**Ideas the original's developers responded to best.** All are delayed and tied to a room:

- **Auto-spike:** for 1 AP, a stance that spikes the first person to enter the room. Praised because it rewards asynchronous play and doesn't favor whoever is online most.
- **A hidden mould** (the lead developer's own sketch): 0 AP and a spore plants it in a room's shelf; it grows for 8 cycles, can fall sick, then traps the room at each day change; a search finds it and 1 AP destroys it; the alarm rings only when it is planted.
- **Infected plants** whose fruit carries a spore half the time.
- **A delayed spore** that activates later, on a trigger.
- **Lab accidents:** a spore risk that rises with the research relays done that day. It taxes a rush in the game's own fiction and creates contamination no Mush caused, which muddies tracing.

**Recommendation.** Build from this list before space boarders. These fit the "clues, luck and counterplay" pillar and suit asynchronous play. Also consider weak baseline versions of the survival skills for every Mush, with the skill as an upgrade. Players say three of four slots go to survival (anonymity, spore AP, water resistance, cheap extraction), so nothing else is ever picked. `balance.md` counts the skill slot as a brake on Phagocytosis; it is also a tax on variety.

**Rejected upstream, for good reasons.** Skills that hide spores from the scanner (a counter to one research), infection that ignores witnesses and cameras, and anything that makes Interrogate reveal nothing.

### 6. Audit the detection tools

**Problem.** Players use "surveillance" for anything that catches a Mush doing Mush things, and say that once the alarms are out a Mush cannot act without outing itself. One called a detectable skill "either busted or literally unusable". `balance.md` has "graded effects, not off switches" as a lever, but no built tool has been checked against it.

- **MycoScan** is stronger than `balance.md` says. It reads only your own level, but a free daily check lets a human see a new spore, place it in time and name the few people they were alone with. Players describe a target sitting at two spores twice in one game and never converting. Add noise, a cost or a delay.
- **Myco alarms** ring at once, every time. With the room log that identifies by elimination. Consider a report per cycle ("spores were detected here this cycle") or a false ring rate.
- **Fix tools one by one.** A veteran's warning: slowing all research makes a few players specialise harder and changes nothing else. The same player named the scanner and spore removal as the real problems.

### 7. False Eden: hide the lie in the mechanism

**Problem.** As drafted, the deception is all in open claims.

- A Mush only matters by dissenting at the one fork where the paths split. With 14 honest readers at 80% accuracy that is about three honest dissenters plus two Mush, a small group to outvote or kill.
- The reading model in `balance.md` already shows the result: 97 to 3 with full turnout. So False Eden wins mainly through whoever controls the jump.
- A dead end costs nothing but the countdown, so a crew with no information can try every leaf and still find True Eden before False Eden half the time.
- The first-pass tree (one or two forks) has no stretch where a Mush reads honestly to build credit.

**Recommendation.**

- Let a Mush covertly bias other players' readings, as contaminated samples do in research. Honest readers then carry the lie, and dissent stops being a tell.
- Make the first test tree at least three forks deep on the true path, with the split at a random depth.
- Give a failed jump a real cost (fuel, a PILGRED recharge, or hunters following), not only time.
- Use the three keys for the choice of leaf.

### 8. Set the burst ceiling on purpose

**Problem.** The spore cap (4 a day for the faction) limits the rate, not the stockpile, and a Mush can hold any number. Phagocytosis turns each spore into 4 AP for 0 AP. Three quiet days bank 12 spores: 48 AP on top of a full bar of 12, about 60 AP in one sitting at 1.5 seconds an action. A knife costs 1 AP, hits 60% of the time for 1 to 5, and has no charges, so on paper that is around 8 AP per kill.

**Recommendation.** Pick a holding limit and write down the intended size of a "cash in". Keep the weapon requirement: the lead developer noted that rampages became far less hated once they needed weapons and a plan, not one skill and a fist. Keep the existing tension that every spore eaten is a spike not made.

**The hunted Mush.** "A hunted Mush is fun to play" has no mechanism yet. An outed Mush needs stored potential to trigger (traps, primed victims, a mould) and somewhere to go. Decision 5 supplies the first.

### 9. Decide what Chun is

**Problem.** The docs disagree. `balance.md` says Chun can't be Mush. `rules-design.md` (2026-10-18) says she is immune to infection but "can still be a Mush from the start". The List "can never contain Chun" in either case.

**What a certified human does to the game,** from a long community argument:

- Telling Chun is free and telling anyone else is a gamble, so players stop talking to each other. The crew becomes a set of private channels to one player.
- Everyone else turns passive ("I only do my character's job"). A new player sees a ship maintenance game, not social deduction.
- Chun is a bottleneck with a real-life schedule. If she sleeps the hunt stalls; if she dies the information and the hidden items die with her.
- She opens every game by running a checklist: collect the weapons and sensitive items, hide the alarms.
- She is the scapegoat for every failure, and one of the last characters picked.
- Other games avoid this: the informed player must hide (Avalon), information is unreliable (Blood on the Clocktower), or nobody is confirmed at all.

**Options raised.**

| Option | Effect | Cost |
|---|---|---|
| Immune to infection, can start as Mush (the `rules-design.md` entry) | A nonzero chance is enough to end blind trust; keeps the immunity status | A Mush Chun cannot be listed, and can stall the researches that need her in the lab |
| Resistance: one or two more spores than others | Chun can be converted like anyone, slowly | Loses the iconic trait; players are attached to it |
| Keep full certainty, make her unreliable (the owner's idea: forced Lethargy, unreachable for 4 cycles) | Lowers what the crew expects of her | Makes her less attractive to play |
| Keep certainty, make talking to her risky (the owner's Radio Pirate rework) | A Mush may be listening to her channels | Judged "busted or unusable" depending on the tell |

**Recommendation.** Keep the `rules-design.md` entry: immune to infection, able to start as Mush. It is already decided, it is the smallest change, and the owner's own words in the thread were that the chance "just needs to be non-zero". Then fix `balance.md`'s pillar text, and decide whether a Mush Chun can appear on the List.

**Related.** Any other free, permanent certainty has the same effect. The serum is fine because the certainty is scarce and can be undone by a later spike.

## Numbers, after the structure

| Knob | Today | Suggestion | Why |
|---|---|---|---|
| Starting rations | 32 | Trial 24 | See "Food" below |
| AP per ration | 4 (5 with Sirius) | Keep | Cutting it was argued down upstream: the walk costs about 1 AP, so people hoard and eat more |
| Rations eaten in pre-selection | Unlimited | Decide a limit | Late joiners inherit an emptied refectory |
| Spores a Mush can hold | No limit | Set one | Burst ceiling |
| Earliest Eden arrival | Undecided | Pick the day first | Every other clock is tuned against it |
| Detection research | Flat pace | Pace back from a target day | Already a lever in `balance.md` |
| Two Mush from how many players | 9 or more | Consider 10 or more, counted on active players | A 9-seat ship with two inactives played as 5 against 2 |
| Selection threshold | None | Hold selection until enough active players | Understaffed ships are where the Mush snowball |

### Food

- **Size.** 32 rations at 4 AP is 128 AP. Fourteen humans regenerate 112 AP a day between them, so the refectory holds a little more than one extra crew-day.
- **Shape.** It is a burst, not a trickle. Players say it is spent mostly by the lab in the first two days and name it as the engine of the research rush ("three researches by the middle of day 2").
- **As a clue.** Low output is a real soft tell for characters whose work is visible, and a weak one for everyone else. A veteran called AP limitation "a core pillar of the investigation".
- **As a clock.** It isn't one. With 32 rations, crews in the original never starve ("not since 2013"), and the first expedition leaves on day 2 at the median (1.9 days on the French server, 2.2 English, 2.5 Spanish, counted from ship creation). If rations are meant to run out, there are too many.
- **Side effects of fewer rations.** A Mush eating to drain the supply becomes a real play, which the owner already intends. Cooking away the stock also becomes one. Fewer chances to get dirty by cooking. A slight nerf to Fungal cuisine.

An earlier pass of this review called the food gap negligible. That was wrong about its shape.

## The clocks, on one line

From the config numbers; the arithmetic is Claude's.

| Clock | Favors | Bites around | How it was worked out |
|---|---|---|---|
| Conversion majority | Mush | Day 6 at best; day 8 with the bacteria | 4 spores a day, 3 per convert (4 with the bacteria); 2 Mush need 7 converts of 14 humans, with no spore eaten and nobody dead |
| The List names a starting Mush | Humans | Day 7, if printed that late | 8 names, one fewer per day |
| Starvation | Mush | Day 11 | 24 cycles of grace, then 28 cycles per ration at 2.3 rations each; sooner for every ration eaten for AP |
| Morale at 0 | Mush, once built | Day 7; day 4 without Chun | Start 7, minus 1 a day with Chun alive, 2 without |
| Hunters and incidents | Mush | Not tuned | Both grow by day |
| Eden and Sol arrival | Humans | Undecided | |

The conversion ceiling is slow. A Mush majority by conversion alone is close to impossible, so the NERON majority rule will in practice be reached through kills.

## Measuring with few games

Sixteen players over several days means dozens of games, not thousands. Thirty games gives a win rate within about 18 points either way, and conditional targets such as "Mush win rate given two conversions by day 2" will have no sample at all. "A real path to winning on the final day" cannot be computed from a record.

- **Turn the invariants into headless tests.** Passive Mush lose. An unhindered crew reaches Eden by its target day. The fastest conversion majority lands where the table says.
- **Ask one question after each game:** "Did your side still have a real chance on the last day?" Closeness is a perception.
- **Use 1-hour cycles** for volume.
- **Count leading indicators, not wins:** the day of the first hostile act, the day of the first wrong kill, how many players were alive at the end, how much work was done on PILGRED and Eden while a Mush was alive.

The last indicator measures the loop directly. If crews work on the endings with Mush alive, the stalemate is broken.

## Memorable games

- **A personal score on the end screen.** The original's triumph gives an outed Mush, a convert and the dead something to play for. It can sit beside the faction result without replacing it.
- **Replays.** Players of the original ask for them and its developers say the data isn't stored. This project already records every input, so a short highlight reel at the end (first spike, who converted whom, the closest call) is cheap and is where the story gets told.
- **Reasons to move around.** A veteran's view of where the original should go next: make more rooms matter and give everyone reasons to walk. Room-based infection (decision 5) does both.

## Not worth doing now

- **Space boarders.** Expeditions already give a reason to carry weapons, and it is a whole new system.
- **Anti-passive research.** Decision 1 replaces it.
- **A visible debuff on killers.** It clears them as human.
- **Slowing all research across the board.**
- **Cutting AP per ration.**
- **AP from food for Mush, paid out gradually** (the owner's "Metabolism" idea). A veteran's objection was that it feeds preparation for a rampage and removes a core clue. This ruleset's answer (no AP, same full belly) is the better one.

## What the original does

Checked on eMushpedia on 2026-11-10. These describe eMush, not this game.

- **Triumph** ("Triomphe"): the score is personal. Humans gain 1 per cycle survived, plus character goals. Mush start at 120, lose 2 per cycle, and gain 8 for completing a conversion, 3 for killing a human, 7 if Chun dies and 16 if every living player is converted.
- **Morale** ("Points de Moral"): start 7, cap 14. At 0 the character kills themself at the next cycle change. A crew member's death costs everyone 1, except after a suicide, a trade or a quarantine. The daily loss is 2, less 1 while Chun lives. A Mush's morale is always at maximum.
- **Eden** ("Atteindre Eden"): three star map fragments, the Super Calculator research, then a 33% calculation for 2 AP per fragment, then the jump with PILGRED repaired. It counts as a human victory only with no Mush aboard, the cat included. The page calls it the hardest ending to get.
- **A destroyed ship** ("Daedalus détruit"): "can be considered a Mush victory if there was active sabotage. Some players consider it a draw."
- **NERON** ("Les morts"): kills everyone when only Mush remain at a cycle change. The majority rule decided here triggers earlier.

## Thread digests

What each shared thread contributed, so the reasoning above can be checked.

### Radio Pirate rework (the owner's proposal)

The owner proposed: at the comms center, 3 AP, private, once a day, one target at a time; the hacker reads the target's channels and can speak as them; the target never sees the spoofed messages; a 1 AP "factory reset" clears any hack without saying whether there was one. The aim was to make talking to Chun risky so other investigators get used.

Objections: reading private channels with no risk is too strong; any tell makes the hacker traceable by AP counting; alarms on the bridge would kill it; it would spawn rituals; it makes Chun worse to play. Used here for the tests "counter-measures are blind", "no rituals" and for decision 9.

### The three-key PILGRED lock

Summarised under decision 2. Other points: players say PILGRED rushes are rare and the real issue is that PILGRED goes untouched; a companion idea was to split the repair into stages that favor different skills; one veteran argued the lock only works together with changes that weaken the rampage and strengthen infection and sabotage after the first research wave.

### Mush skill ideas (French)

A long brainstorm, mostly one player's, with developer reactions. Summarised under decisions 5 and 6. Other ideas that got little support: a dead alpha's spores staying in the room, a once-per-game mass infection, spores hidden from the scanner, a spore cloud, team-only versions of existing skills, Mush bonuses bought when a research completes. A developer's rule from it: a skill that only handles one research will never be worth a slot.

### Consequences for killing a human

Summarised under decision 4.

### A Mush flying off with key items

A Mush takes the research items, leaves in a ship and is lost with them. Players find it unfair because nothing can be done about it, and developers note it rarely helps the Mush win. The consensus was to let turrets shoot the ship. Used here for the test "preventable in hindsight". Check the same play in this ruleset's patrol ships.

### Start with fewer rations

Summarised under "Food". The thread settled around 24, with some wanting a trial at 16. Lowering AP per ration, and a research that restores it, were both argued down.

### AP from food and the long game (the owner's proposal)

The owner proposed paying ration AP out over several cycles and cancelling it on any aggressive act, so a Mush could eat. A veteran's reply gave the three-question checklist and the description of the loop used in the diagnosis. The owner's reply named the missing piece: something that puts the Mush "on the clock". Decision 1 is that clock. The same thread raised a lobby threshold for understaffed ships and the owner's idea of replacing inactive players with single-purpose androids bought from traders.

### Chun and immunity

Summarised under decision 9. The lore argument (her status and a database entry both say immune; her biography does not) matters less than the split it showed: players are attached to the trait, and most of the original's decision-makers want to keep it.

### Transfer and the dead

Upstream, a Transfer needs the same room and one spore, leaves no log, and resets both bodies' skills. Here it leaves no trace. The same thread showed a dead player talking about a live game in public, which is the out-of-game coordination problem `balance.md` already lists.

## Corrections and gaps

- **Corrected:** the food gap (see "Food").
- **Corrected:** `balance.md`'s "MycoScan is not a test" (decision 6).
- **Not checked:** whether the original's death message reveals the role.
- **Not checked:** how patrol-ship flight with stolen items plays in this ruleset.
- **Not modelled:** the readings game with AP budgets, converts arriving mid-game, and a crew that discounts suspects.

## Questions for the owner

1. Is Eden a human win with Mush alive? If yes, what is the earliest day it can be reached?
2. Three keys and a countdown in place of the single Commander? What does a Transfer do to a key?
3. Is Sol a gamble by design, or does the crew get a count?
4. What does a wrong kill cost, and does a Mush feel morale?
5. Which delayed infection comes first?
6. What changes on MycoScan and the alarms?
7. Can Chun start as Mush, and can she be on the List?
8. How many spores can a Mush hold?
9. Starting rations: 32 or 24?
