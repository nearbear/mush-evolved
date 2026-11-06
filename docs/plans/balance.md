# Balance and tuning

**Status:** draft, 2026-11-04, corrected 2026-11-05, design pillars added 2026-11-05. The goals are the owner's own words. The directions below are the owner's (recorded in `docs/rules/rules-design.md`); the targets and remaining levers are still proposals. The open questions are listed at the end.

## Goals (owner, 2026-11-04)

- The Mush are an **informed minority under pressure to act sooner rather than later**, because the humans gain information over time.
- **Stealth is a valid strategy, but it has a price.** A Mush must not be able to do nothing and blend in perfectly.
- **No mechanical testing.** Humans should not be able to unmask a Mush by a cheap, repeatable check (eMush's "who doesn't eat" is the example to avoid). A few scarce, deliberate methods are fine (the List).
- **No Mush snowball** from too much AP.
- **No human lockout** from rushing research: the Mush must keep meaningful moves until late in the game.

## Design pillars (owner, 2026-11-05)

From a design Q&A on social deduction failure modes (Among Us is the cautionary example).

- **The feel.** Humans: paranoid detective work with a few big reveals. Mush: a tense double life with a few big swings.
- **Close beats even.** An even win rate matters less than both sides always having something meaningful to do. This covers "no lockout" and "no Mush snowball": the main measure is whether the losing side still had a real path to winning late in the game.
- **No incidental proof of humanity.** Only mechanics designed for it may prove someone human: Chun (who can't be Mush), and a serum injection, after which the target is human. Any other mechanic that happens to prove humanity is a bug in the design (eMush's example: becoming visibly sick proves you human). The same goes for proving someone Mush: the only proofs are designed ones such as the List, a death message, or real detective work (below).
- **Deduction comes from detective work.** Proof is allowed when it comes from collecting clues about a hostile act and narrowing the suspects. Getting those clues should involve some luck, and the Mush should have counterplay (example: a Mush sets off a myco alarm, then uses the Defacer skill, eMushpedia "Dialoguiste", to muddy the record).
- **A quiet setup.** Day 1 doesn't need to give humans anything to deduce from. The Mush work unseen to build up an advantage they cash in one of two ways:
  - **Explosive rampage**, which should push the humans to **return to Sol** fast;
  - **Gradual sabotage**, which keeps them from getting home and makes **Eden** the natural goal while the crew slowly collects starmap fragments.
  So the two Mush strategies should each point the crew at a different ending, and each ending should be a real answer to one of them.
- **A hunted Mush is fun to play.** An outed Mush is forced into a rampage, and that should be a satisfying, dangerous state of play, not a loss with extra steps.
- **Converts are fully Mush.** A converted player wins when the Mush win, gets full Mush credit on the end screen and in stats, and should want the Mush to win.
- **Time of day is part of the game.** A Mush rampage while the crew is offline is fair. Characters marked easy should need less of their player's time than the others.
- **The dead spectate.** A dead player never interacts or communicates with the living in any way and may leave at any time.
- **Mistaken kills will cost something** through the mental health system (not designed yet).
- **NERON majority rule:** NERON kills everyone the moment living Mush strictly outnumber living humans (3 of 4 triggers it, 2 of 4 doesn't). It counts as a Mush win, and cuts a long cleanup short.
- **Inactive players** will eventually be tradable to merchant ships ([#143](https://github.com/nearbear/mush2/issues/143)), with the trade making up for the AFK penalty somehow (details open).
- **Out-of-game coordination is against the rules**, no exceptions. It can't be fully solved; mitigations are welcome (see open questions).

## Directions chosen (owner, 2026-11-04 and 2026-11-05)

- **Food: Mush gain no AP from any consumable, no exceptions** (rations, coffee, bananas). This is already how `consume` works: a Mush's meal has no effect at all. Rations give humans **4 AP**, 5 once Sirius is contacted.
- **Eating must not be a test.** Mush get the same full belly as humans, so they are refused food at the same point (being fixed in a separate change).
- **Phagocytosis stays as built** (0 AP and 1 spore for +4 AP, +4 HP, as on eMushpedia). It is the Mush's food-sized AP refill, paid for in spores.
- **Return to Sol stays as decided** (a living Mush at arrival is a Mush win). This is the counterweight to a PILGRED rush: anyone repairing PILGRED while Mush may be alive becomes kill on sight, and it is the investigators' job to make sure it isn't repaired too early. The owner isn't sure they love this mechanic but keeps it for now.
- **The List is built as in eMush** (below).

## Targets (proposed)

The numbers are placeholders to argue about; what matters is that each goal has a measurement.

| Goal | Metric | Placeholder target |
|---|---|---|
| Close games (primary) | Share of games where the eventual loser still had a real path to winning on the final day | High; definition to decide |
| Fair game (secondary) | Mush win rate | 40–50%, loosely |
| Information clock | Median day of the first confirmed Mush (cured, killed by a crew that knew, or proven by a scarce test) | Day 3–5 |
| Stealth has a price | Share of Mush wins where the Mush took no hostile action (no spike, contaminate, sabotage, spore food or Transfer) | Near 0% |
| No lockout | Share of games where the Mush have no useful hostile action left before day X | Under 10% |
| No snowball | Mush win rate given a Mush lead at day 2 (2+ conversions) | Not above ~75% |
| Pacing | Median game length | To decide |

"Confirmed" and "hostile action" need exact definitions before any of this is measured, since the telemetry ([#62](https://github.com/nearbear/mush2/issues/62)) has to count them.

## Where the game stands (2026-11-05)

Read from `shared/src/config.ts` and `docs/rules/implemented-rules.md`.

### The AP economy

- **Everyone:** start 8 AP, +1 per cycle (8 a day with 3-hour cycles), cap 12, carried over.
- **Humans on top of that:** food. Rations give 4 AP (5 with Sirius), coffee 2 AP, a banana 1 AP, limited by satiety (full belly at 3, a ration gives 4) and by supply (32 rations, the coffee machine once a day, bananas from botany).
- **Mush:** no AP from food at all. The only Mush AP source beyond regeneration is **Phagocytosis**: extraction costs 1 AP for 1 spore, eating it gives 4 AP and 4 HP, so **net +3 AP per spore**, up to the faction's 4 spores a day. The brakes are the cap, the skill slot, and the `dirty` status from extraction (a soft tell, washed off in the shower).

So the price of stealth is already in place: a Mush who never extracts spores has a human's regeneration and none of a human's food AP. A Mush who wants to keep pace has to extract spores, which leaves traces.

### What pushes the Mush to act

- **The List shrinks every day** once built, so waiting makes a starting Mush easier to name.
- **Detection research** (myco alarms, the serum) comes online as the crew works on it.
- **Fewer AP than a fed human** unless they extract spores.

### What pushes the humans

- **They can't win by leaving.** Return to Sol with a living Mush is a Mush win, so the crew has to find the Mush before anyone takes the ship home, and anyone repairing PILGRED early is suspect.

### What the humans can use to find Mush

| Tool | What it gives | Scarce? |
|---|---|---|
| Myco alarms (research) | An anonymous ring when a `spore`-tagged action happens in their room | Three alarms; placed in rooms |
| MycoScan (research) | Checking **your own** spore level, once a day | Self only; not a test of others |
| Anti-Mush serum (research) | Vaccinating someone; the user gets a private "worked / did nothing" | **A real test**, but one serum, used up |
| Mush-eating bacteria (research) | Humans' contamination capacity goes from 3 to 4 | Slows conversion; reveals nothing |
| Interrogate (Torturer) and action history | The names of a target's recent actions | Skill-gated |
| Cameras, room logs, `dirty` | Who was where, and who got dirty | Soft information |
| The List (Tracker) | Not built; see below | One per game |

The serum is a test of exactly the kind the goals allow: scarce, deliberate, and costly to waste. MycoScan is not a test, because it reads only your own level.

### The List

To be built as in eMush (eMushpedia "LA Liste", "Traqueur"). Eleesha's Tracker skill can print one document per game at the Tabulator. It holds the name of **one character who started the game as Mush**, padded with random names to the list's size. The size starts at **8 names and drops by one per completed day**, so a list printed on day 7 names the Mush outright. It can never contain Chun, and it may include the second alpha Mush by chance. It can be torn up.

It fits the goals closely:

- **Information grows with time by construction.** The crew's choice is when to print: early gives a vague list now, late gives a sharp one when it may be too late.
- **It pressures the Mush to act early,** since every day of waiting shrinks the list, and whoever has Tracker becomes a target.
- **It's scarce and can be countered:** one print, it can be torn up, and only the starting Mush are on it, so converts are safe from it.

Other scarce tests can follow the same pattern: one use, a cost, and accuracy that rises with time.

### Feedback loops

| Loop | Brake today | Concern |
|---|---|---|
| Spores → Phagocytosis → AP → more spikes → conversions | Faction cap of 4 spores a day; `dirty`; a Mush skill slot | The cap is the main brake; watch it if Mush skills add spore sources |
| Conversions → more Mush bodies → more actions | Each convert brings a human's regeneration but loses food AP; the spore cap is per faction, not per Mush | Good: the cap doesn't grow with converts |
| Research → detection tools → Mush found | Assays at 25/50/75/100% let contaminated samples spoil (`research-sabotage.md`) | A rush is the Mush's clock running fast |
| Humans busy on research → ship neglected | Incident points rise by day (#184); hunters | Not tuned yet; this is the natural tax on a rush |

## Levers

### Keep research contestable

- **Graded effects, not off switches.** Each detection research should narrow the Mush's options, not end the game for them.
- **Sabotage windows.** The assays exist; check that a rush gives the Mush real chances to spoil it (and that sabotaging exposes them).
- **Opportunity cost.** Tune incidents and hunters so that a crew putting all its AP into research loses something real elsewhere.
- **Pace backward from the target.** Choose the day each detection tool should arrive, then set research progress per action from that.

### Snowball brakes

- Keep every Mush-side cap per faction, not per Mush.
- Watch for any reward from converting that scales with the number of Mush.

### Price of stealth

- Already set by food: compare a passive Mush's AP with a fed human's, and a spore-extracting Mush's with both. If passive Mush still win often, the gap is too small or detection is too slow.

## Method

1. **Define the metrics** above exactly, so they can be computed from a game record.
2. **Simulate the economy headless.** The rules are pure and seeded, so a script can run thousands of games with scripted archetypes (passive Mush, aggressive Mush, research-rush crew, balanced crew) and report AP per side per day, research completion days, and the fastest possible conversion rate. This answers economy questions, not social ones.
3. **Single-player games with model bots** for qualitative checks. They are not data for tuning numbers.
4. **Real games** for the social side: telemetry ([#62](https://github.com/nearbear/mush2/issues/62)) and a balance version in each game's record ([#271](https://github.com/nearbear/mush2/issues/271)). Change one knob per version.
5. **Every number stays in `config.ts`**, so a sweep or an A/B setup is a config change.

## Open questions

- **The sneaky PILGRED win (owner, 2026-11-05: "not a fun way to lose").** Two Mush can repair PILGRED quietly, using Phagocytosis for the AP, and don't even need the Commander on their side: they can Transfer into the Commander. The owner is not resolving this yet. Candidate fixes raised: a public, abortable countdown once PILGRED is repaired; NERON announcing progress milestones; requiring several crew to go home; or barring Phagocytosis AP from PILGRED.
- Ways to blunt out-of-game coordination.
- An audit of built mechanics for incidental proof of humanity (public statuses, refusals, prices, log lines that only one faction can produce).
- The target numbers in the table, and exact definitions of "confirmed" and "hostile action".
- Whether the Return to Sol counterweight stays once real games show how PILGRED rushes play out.
- When the List gets built (it needs the Tabulator and the Tracker skill).
