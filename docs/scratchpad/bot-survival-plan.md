# Bot survival: oxygen, orbits and beds

Owner decisions of 2026-11-19. Run A is built and committed; everything after it is not. Method: the `bot-strategy` skill (one change per run, same seeds, measured against the run before).

Order of work: Run A (done) → Run A2 (bedroom loop, done) → **Run A2c (fuel relay)** → **Run A3 (bed tiers)** → **Run A4 (Shrink beds and announcement)** → Run B onward as before. The bed runs came out of tracing Run A's remaining orbit stays (below).

## Diagnosis (2026-11-19)

50 seeds, crew 16, cap 30 days, incidents on, committed `main` after the Commander's Issue mission (#462, not used by bots yet). Saved as `docs/scratchpad/survival-o2diag-2026-11-19.json`; full write-up under "Why oxygen still runs out" in `docs/plans/bot-goals.md`. The harness now logs every jump (to a planet or escape, its trigger, cycles held, planets held, free astro slots) and every orbit (Oxygen sectors, expeditions, oxygen brought, when every sector was explored).

- **Budget:** 4.32 oxygen in a day (expeditions 3.31, plants 1.01) against 8 burned; about 25 oxygen short a run.
- **An Oxygen planet pays:** an orbit of one brings 14.7 oxygen (1.0 Oxygen sectors, 1.8 expeditions), the first about 3 cycles after arriving. But the ship is in orbit only 31% of cycles.
- **Cause 1, held destination jumps:** a destination is shared at median cycle 1, but every jump to a planet (1.5 a run) waited for the #421 hold trigger (hunters 41, oxygen 33), a median of 9 cycles, arriving with oxygen at a median of 8. First orbit at a mean cycle 18.5.
- **Cause 2, orbits that never end:** in 65 of 74 orbits every sector was explored, and the ship stayed a mean 8.5 cycles more (11.0 a run; 18 stays of a day or more; seed 1 sat 49 cycles). `readyToLeaveOrbit` counts explored sectors only from shared reports, so a report that never comes (the explorer died, or a LOST sector was added mid-orbit) keeps the Commander in orbit while every Pilot has given up launching (`noTakeoff`).
- **Cause 3, escape jumps on the oxygen trigger:** 52 of 83 escape jumps. They bring no oxygen, cost 1 fuel and erase the 0.9 planets then held, while the Astrophysicists still had 2.3 free planet slots.

Facts the plan rests on:

- Board (`board_icarus`) and Take off (`icarus_takeoff`) disappear when refused rather than showing disabled; "explored", "no spacesuit" and "Icarus lost" aren't in `UNAFFORDABLE_REASONS`. Either way, only someone in the Icarus Bay sees them; the Icarus being away or lost also shows only there.
- Bots never use patrol-ship landings (`land_on_planet`), so for bots a lost Icarus ends expeditions.
- An Astrophysicist's analysis costs 2 AP and reveals 2 sectors. AP caps at 12 and comes back at 1 a cycle. Planets have 2–12 sectors on days 1–4, 4–16 from day 5 and 6–20 from day 10, so a large planet can't be analyzed in one go.
- Other players' AP isn't in `OtherPlayerView`: the Commander can't see who is short.

## Plan

Run in this order, one change per run, on seeds 1–50 with `--report`, each saved with `--out` and compared with `--compare` against the run before (Run A against `survival-o2diag-2026-11-19.json`).

### Run A: leave orbit once no expedition can launch (cause 2)

- **Rules fix** (`rule` skill): Board and Take off show disabled with the reason "explored" or "Icarus lost" instead of disappearing (the owner's disabled-not-hidden preference, `web/CLAUDE.md`). Reason text in en/fr/es (`i18n` skill).
- **Bot:** a bot in the Icarus Bay that sees either reason posts one fixed global line, e.g. `Expedition: done at <planet>` or `Expedition: no Icarus`. One bot is enough, since both facts hold for the whole ship. A missing spacesuit is per person and posts nothing.
- **Commander:** leaves orbit on that line, as well as on the shared reports it reads today. The other conditions stay: no expedition out, everyone aboard.
- **Bar:** cycles in orbit after every sector was explored, 11.0 a run, near 0; stays of a day or more, 18, near 0.

**Status: built, short of the bar.** Cycles in orbit after every sector was explored 11.0 → 6.6 a run; stays of a day or more 18 → 11; seed 1's worst stay 49 → 17 cycles; endings, days and oxygen in unchanged. Saved as `survival-runA-2026-11-19.json` (10-seed smoke: `survival-runA-smoke-2026-11-19.json`).

**Correction to Run A's reading.** The Run A session wrote (in `docs/plans/bot-goals.md`'s Run A bullet) that Jinsu, the Commander and a Pilot, stays at 1 AP because he spends it on patrol ships and turrets. A per-action trace of seed 1 (cycles 22–31 at Natodon) disproves that for seed 1: hunters were 0 most of the stay, patrol already needs 9 AP (`SCRIPTED_PATROL_AP`) and ranks below `travel` (75 vs 77). What actually happened:

1. **Bedroom loop.** Both bedrooms (3 beds each) were full. `rest` learns a bed is free only on arrival, and `memory.ended` clears every cycle, so each cycle he walked Bedroom A → Bedroom B → wander (`explore`), spending the 1 AP he'd just gained. He stayed at 0–1 AP.
2. **Leave-orbit chain underestimated.** `travel`'s leave-orbit option checks only "bridge reachable with 1 AP" (`rawCanAfford`), but the goal first walks to the Motor Room to check the combustion chamber (and loads fuel if short). `leavesBed` gets a resting bot up as soon as the option is offered. At cycle 29 he had 3 AP, got up, walked toward the Motor Room, ran short, the goal failed, and he went back to the bedroom loop.

The Run A bullet in `bot-goals.md` now carries this corrected reading. Seeds 13, 31 and 41 were not retraced; trace them (temporarily log each Commander action in `survival.ts`'s bot loop under `--verbose`, or add it to the trace for good) before assuming they share this cause.

Still open from Run A: once every Pilot is dead, sectors can be left with nobody able to launch; Board stays legal for non-pilots, so nothing turns disabled and no line goes out (seed 1's last orbit). And the leak-check's question: during a patrol-ship landing, someone in the bay can see Board turn to "explored" before the pilot's report arrives (the hidden button gave the same away before). Neither is decided; ask the owner.

### Run A2: stop the bedroom loop

Facts: 7 beds for 16 crew (`bed_a_a/b/c` in BEDROOM_A, `bed_b_a/b/c` in BEDROOM_B, `sick_couch` in SICK_BAY). Lying gives +1 AP a cycle (2 instead of 1). Who lies in which bed is visible only inside that room (`OtherPlayerView.lying`); other rooms' occupants only with ACTOPI.

- **Remember full bedrooms across cycles.** When a bot finds no free bed in a room, it remembers that room as full (new `BotMemory` field, persisted like the rest) until it next sees the room with a free bed, or sees one of the people it saw lying there elsewhere / standing. `rest` doesn't offer a room remembered as full.
- **Nothing left: keep the AP.** With every bed in reach remembered as full, `rest` offers nothing and the bot doesn't wander for it.
- **Leave-orbit affordability** (same run or right after, owner's call at build time; one change per run favors right after): the leave-orbit option counts the whole chain (Motor Room check if no chamber reading, fuel if short, bridge, `leaveOrbitAp`), so `leavesBed` doesn't get the Commander up until he can finish in one go.
- **Bar:** cycles in orbit after every sector was explored (6.6 a run after Run A) and stays of a day or more (11) down; AP spent on moves by resting bots down. **Watch:** that bots who can't rest don't idle at full AP.

**Status (2026-11-19): memory built; leave-orbit affordability tried and dropped (owner).** Full-bedroom memory: AP walking to rest 495.5 → 353.2 a run, crew lying 6.56 → 6.29, bots at their AP cap 0.02 → 0.01 a cycle; orbit stays unchanged (6.6 → 6.6 a run; day-plus stays 11 → 18); endings within noise. Leave-orbit affordability (A2b): 6.6 → 7.2 a run; it stranded seed 3's Commander for 59 cycles because lower goals spend his AP below what the chain needs, so it would need that AP protected (like `keepsHeldJump`). Details and saved runs in `docs/plans/bot-goals.md` ("Reaching Eden").

### Run A2c: the fuel relay (owner, 2026-11-20; before A3)

Fuel loading leaves the Commander's chain. Taking and loading capsules is free (0 AP); the cost is the walk to a tank and the Motor Room, which is what A2b found the Commander can't afford once lower goals have spent his AP. Anyone may load; Technicians (`engineer`) and Raluca are the natural loaders (they get dirty anyway and work near the engines).

- **The request (Commander).** One fixed global line, `Fuel: need <N>`: the chamber level the next move needs. In open space, the prepared jump's distance (the shared destination, else 1 for an escape jump), posted when preparing starts; on arriving in orbit, `Fuel: need 1` for leaving, so the chamber is filled while the planet is explored. A newer request replaces the older; a jump or leaving orbit voids it.
- **The claim (helper).** The first bot to set out posts `Fuel: loading` (owner, 2026-11-20: a claim line like `Tank: going to`), and the others stand down. A claim lapses after its cycle, like the tank claims.
- **The work.** The helper takes capsules, checks the chamber (free), loads or unloads it to exactly N (travel burns everything in the chamber, so overfilling changes the jump), and posts one line when done: `Fuel: chamber at <N>` (owner, 2026-11-20: one line a request, not one a capsule).
- **The Commander trusts the report** (owner, 2026-11-20: trust isn't a concern yet) and only walks to the bridge, turns and jumps or leaves.
- **Who and when (Claude's picks, confirm):** Technicians and Raluca take the request at once; any other bot (not the Commander) after it is a cycle old; the Commander loads it himself, as today, after 2 cycles without a report (owner: acceptable fallback), or at once when the jump is due. The helpers' goal ranks 76.6, between the coffee relay (76.5) and `travel` (77), and keeps the AP reserve.
- **Hypothesis:** in A2/A2b the Commander stayed in orbit 6.6 cycles a run after every sector was explored, waiting for AP to walk tank → Motor Room → bridge. With the chamber filled during the orbit, leaving costs him only the walk to the bridge and 1 AP. **Bar:** cycles in orbit after all explored down from 6.6 a run, and stays of a day or more down. **Watch:** helpers' own jobs (Technician repairs, research), duplicate trips despite the claim, and capsules left in hands.

**Status (2026-11-20): built and measured.** Orbit stays after every sector was explored 6.4 → 3.3 cycles a run (day-plus stays 13 → 4); 6.7 of 8.6 requests a run answered by a helper. Mean change −0.25 days, at the edge of noise: escape jumps on oxygen more than doubled (55 → 126 over 50 runs), which points at Run D. Details in `docs/plans/bot-goals.md` ("Reaching Eden").

### Run A3: bed tiers, with yielding (owner, 2026-11-19)

Tiers (owner, 2026-11-19: all three tiers, the Commander in tier 1), from what a bot can see of itself and of people in its room (skills and titles):

| Tier | Who |
|---|---|
| 1 | Pilots and the Commander |
| 2 | Bots with another AP-hungry skill or title job (Astrophysicist, Technician, Botanist, Comms Officer, and so on: take the list from `BOT_DUTIES`) |
| 3 | Everyone else |
| last | The Shrink (Run A4) |

- **Beds stay full; higher tiers preempt.** No bed is reserved. A bot that arrives at a full bedroom and sees someone of a lower tier lying there asks for a bed and waits in the room.
- **The ask (owner, 2026-11-19: a global chat line).** The waiting bot posts a fixed global line, e.g. `Bed: <name> waiting in <room>`, parsed like the expedition lines. Only that line triggers a yield: a higher-tier bot merely standing in or walking through the room must not (owner). The line reveals only the asker's own location, which it chose to share. Run `leak-check` on it.
- **Yield (owner: yes, even before its AP is full).** A lying bot that reads a bed line from a higher-tier bot it can see in its room gets up (`get_up`) and leaves; lowest tier, then the one with the most AP, yields first. The asker then lies down.
- **Bar:** Pilots' and the Commander's cycles at low AP during orbits and hunter waves down; patrol sorties and Icarus launches up. **Watch:** morale (lost bed time for tier 3) and the #452 morale work.

### Run A4: the Shrink takes free beds and says where it is (owner, 2026-11-19; changes #452)

- **Change to #452:** a Shrink may now lie down, but only in a bed nobody else is asking for: an empty bed in its room. It is the lowest tier and gets up for anyone who asks (Run A3's yield, any tier).
- **Announcement:** when the Shrink settles in a bedroom it posts a fixed global line, e.g. `Shrink: in <room>`. Other bots use it to pick a bedroom: the Shrink's presence doesn't take a bed from them (it yields) and lying there gives +1 morale (`shrink.lyingMorale`). It works without ACTOPI. Keep `LEAVE_SHRINK_BEDS_MORALE`'s rule (bots at 12+ morale leave the Shrink's beds to others when another is in reach).
- Update `rest.ts`'s Shrink doc and `shrinkRest`, the Shrink's model prompt in `BOT_DUTIES`, and record the #452 change where #452's decision is recorded.
- **Watch:** morale deaths (#452) and the number of free beds left empty.

### Not in this plan: Antisocial (a rule, not a bot change)

Raluca should never be in a dorm; today she often just stands in the rear corridor. In eMush she starts with the `antisocial` status: −1 morale each new cycle when she isn't alone in her room (`antisocial_modifier_for_player_-1moralPoint_on_new_cycle_if_player_in_room_not_alone`; it also blocks flirting and bonding). mush2 doesn't implement it. Implementing it is a rule change (`rule` skill, with the owner) and then a bot change (an Antisocial bot rests and works where it's alone, and never takes a dorm bed). Open a GitHub issue for it rather than folding it into the bed runs.

### Run B: destination jumps go at once (cause 1)

- The #421 hold no longer applies to a jump to a shared planet. It keeps the safeguard: post `Jump: now` and wait until the minimap shows everyone aboard, at most 2 cycles (`JUMP_WAIT_CYCLES`).
- A share that arrives while an escape jump is held: jump to the planet at once.
- **Bar:** median hold before a planet jump, 9 cycles, down to about 0–2. First orbit (mean cycle 18.5) earlier, and oxygen on arrival (median 8) higher.

### Run C: escape on 7 hunters

- `HOLD_HUNTER_TRIGGER` 5 → 7 (5 is too few).
- **Watch:** hull, ships destroyed (7 now) and hunters shed by jumps.

### Run D: no escape jump on oxygen

- `HOLD_MIN_OXYGEN` no longer triggers escape jumps; they fire on 7+ hunters or after `HOLD_MAX_DAYS` (4) only.
- **Bar:** escape jumps on the oxygen trigger, 52, down to 0. **Watch:** oxygen and fuel.

**Status (2026-11-20): built and measured** on top of the fuel relay. Escape jumps on oxygen 126 → 2 over 50 runs, runs reaching an Oxygen planet's orbit 31 → 36, mean days +0.29 (22 longer, 9 shorter). Details in `docs/plans/bot-goals.md` ("Reaching Eden").

### Run E: Astrophysicists save AP for a full analysis

- **Scan at once** when the Astrophysicist holds no planets.
- **With one planet held, save AP.** Analyze when AP covers that planet's unknown sectors (2 AP per 2 sectors) with the 2 AP reserve on top, or when the next cycle's AP would be lost at the cap (12). A planet too big for 12 AP is analyzed that way, a batch at a time.
- **Second planet:** scan it only once the first is analyzed or deleted, or when AP would overcap.
- **Share only fully analyzed planets:** no unknown sector and no deadly one (Mankarog, Volcanic activity). This replaces the early share of 2026-11-18 (ready on the first Oxygen or Hydrocarbon sector), so the Commander doesn't fly into a Mankarog hidden in an unknown sector. Deletion stays as today.
- **Protect the saved AP:** goals ranked below astro must leave it alone, like the Commander's held jump (`keepsHeldJump`). Goals above astro (fires, oxygen tanks, self-care, coffee) may still spend it.
- Why (owner): planets come with fewer hidden dangers, and the Commander can jump more freely when the Astrophysicist hasn't sunk AP into analysis.
- **Watch:** shares come later (median cycle 1 today); deaths in exploration and on Mankarog planets; orbits of planets without an Oxygen sector (14 today); jumps to planets with one (60 today).

### Run F: the Commander's Issue mission goes to an Astrophysicist

- An Astrophysicist whose saved AP plus 3 would reach its analysis threshold, or that holds no planets and can't afford a scan, posts a fixed global line, e.g. `Mission: <name> needs AP`.
- The Commander gives the day's mission (+3 AP, 1 AP, any room, once a day) to the first one who asks that day.
- **Bar:** fewer cycles from finding a planet to sharing it, more astro AP spent.

### For every run

- Unit tests for the goal first (`server/tests/goals.test.ts`), then a 10-seed smoke test, then the 50-seed run.
- `leak-check` for the new chat lines and the disabled reasons.
- Update the constants table in `.claude/skills/bot-strategy/SKILL.md` with the date, one bullet under "Reaching Eden" in `docs/plans/bot-goals.md` (negative results too), and one `docs/process/ai-workflow.md` entry.
