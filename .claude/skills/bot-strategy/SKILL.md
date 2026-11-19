---
name: bot-strategy
description: Improve how scripted bots play - why ships are lost, which goal, priority or threshold to change, and whether the change helped. Use when asked why bots lose, to make bots survive longer or play better, to tune a goal's priority or trigger, or to add a goal for the crew's upkeep (hunters, hull, oxygen, fires, food). Diagnose with the survival harness's loss report before editing, change one thing per run, and measure on the same seeds. For bot architecture (views, model calls, keys, spend) use the `bot` skill instead.
---

# Improve bot strategy

A strategy change is an experiment: a measured cause, one change, a measured result. The `bot` skill's rules still apply to any code you write (own-seat view only, coordination only through what players use, seeded RNG).

The harness (`npm run survival -w server`, flags in `docs/process/commands.md`) plays scripted bots on every seat with no Mush and no model calls, so it is free. 50 seeds take about 5 minutes; run them in the background.

## 1. Diagnose before editing

Never start from a guess about what the bots do. Start from the loss report:

```sh
npm run survival -w server -- --seeds 1-50 --report --out docs/scratchpad/survival-pre<issue>-<date>.json
```

Run it on committed `main`, back to back with the runs you will compare against it (an older saved run may predate a rules change). If another session is editing the checkout, work in a worktree so the tree doesn't move under the runs.

Read, in this order:

1. **Endings and death causes:** what actually ends ships.
2. **The budget line.** A ship is lost when something arrives faster than the crew removes it. For hunters the report prints both rates per cycle (arrive, removed). The same sum applies to any killer: oxygen burned against oxygen added, hull lost against hull patched, fires started against fires put out. If the two rates are far apart, only a change that moves one of them by about that gap can work.
3. **What a unit costs:** hull lost per hunter per cycle, shots per kill. These price the options against each other (a shot against a patch against a jump).
4. **Where the AP goes** under attack, for the bots whose job it is and for the rest, and how much is left or wasted at the cap. AP is the crew's only currency; most fixes are moving it.
5. **By cycle:** when the slide starts, and whether another killer (oxygen at 0, crew dying) explains it.

**List every source of the loss before blaming one.** Grep the rules for everything that writes the resource (`ship.hull` is written by hunters, fires, asteroids and rough landings). The first hull analysis (2026-11-13) blamed hunters for all of it; with `--no-hunters`, 20 of 50 ships still lost the hull, to fires alone.

If two killers overlap, take one out and rerun: `--no-oxygen`, `--no-hunters`, `--no-incidents`. A ship that still dies the same way has that problem by itself.

`--verbose <seed>` traces one seed cycle by cycle. If the report can't answer the question, add a field to `CycleReport` (`server/src/testing/survival.ts`) and a line to `lossReport` (`survivalReport.ts`) rather than writing a throwaway script: the next session will need it too.

## 2. Write the hypothesis down, with its number

Before any code: one sentence naming the cause and what the change should move, from the report's own numbers. For example: "0.80 hunters arrive a cycle and 0.64 are removed; the other bots spend 6 AP a cycle on research under attack; at 3.4 shots a kill, sending that to turrets removes up to 1.7 more." If the arithmetic can't close the gap, don't build it; say so and pick another lever.

Tell the user the hypothesis and the bar (which number, how far) before the long run.

## 3. Check what you may change

Goal priorities and triggers were mostly set by the owner. A number in the table can be tried in a run, but shipping a different value, changing who does a job, or adding a goal is the owner's call. Ask first; don't invent strategy the same way you don't invent rules.

| Constant | Value | Where | Decision |
| --- | --- | --- | --- |
| Goal priorities | see the header of `duties.ts` | each goal file, `BOT_DUTIES` | Owner, 2026-11-01 and later; the owner edits `BOT_DUTIES` directly |
| `BOT_AP_RESERVE` | 2 | `bots.ts` | Owner, 2026-10-25: AP kept for emergencies |
| `SCRIPTED_SHOOT_AP` | 5 | `goals/shootHunters.ts` | Owner, 2026-11-01, confirmed 2026-11-13: walking to a turret and back is overhead, so not lower |
| `SCRIPTED_PATROL_AP` | 9 | `goals/patrolShootHunters.ts` | Owner, 2026-11-01, confirmed 2026-11-13: takeoff and landing cost 4 |
| `CREW_SHOOT_PRIORITY` | 51 | `goals/shootHunters.ts` | Owner, 2026-11-13: bots with no hunter skill shoot after their own jobs, before research and projects |
| `SHARED_ITEMS` | metal scrap, extinguisher | `itemShare.ts` | Owner, 2026-11-13: bots share item locations in a fixed global-chat line; extinguishers #429 |
| `EXTINGUISH_PRIORITY` | 78 | `goals/extinguish.ts` | Owner, 2026-11-14 (#429): above astrophysics; every bot; searching keeps the AP reserve, a known fire may spend it |
| `REPAIR_OXYGEN_PRIORITY` | 77.5 | `goals/repairOxygen.ts` | Owner, 2026-11-14 (#443): right behind fires; every bot; a bot claims a tank room in chat (`Tank: going to`) before going; tank rooms come from the public ship map |
| `REPAIR_DOOR_PRIORITY` | 56 | `goals/repairDoor.ts` | Owner, 2026-11-15: just above `repairHull` (55); every bot; preserves `BOT_AP_RESERVE`; `view.alerts.reports` only (no chat claiming) |
| `EXTINGUISHER_HOMES` | front and rear corridors | `goals/extinguish.ts` | Owner, 2026-11-14 (#429): central, so anyone can reach one |
| `HULL_REPAIR_BELOW` | 50 | `goals/repairHull.ts` | Owner, 2026-11-01, kept 2026-11-13: above it scrap is worth more elsewhere |
| `HOLD_HUNTER_TRIGGER` | 5 | `goals/travel.ts` | Owner, 2026-11-13 (#421); left open as a tuning knob |
| `HOLD_MAX_DAYS`, `HOLD_MIN_OXYGEN`, `JUMP_WAIT_CYCLES` | 4, 8, 2 | `goals/travel.ts` | #421 |
| `BOT_EAT_AFTER_CYCLES` | 16 | `goals/eat.ts` | Owner |
| `SHRINK_DESK_WORK_WITHIN` | 4 | `goals/work.ts` | Owner, 2026-11-01 |
| `SELF_CARE_MORALE`, `SELF_CARE_PRIORITY` | 5, 79 | `goals/selfCare.ts` | Owner, 2026-11-18 (#452): at 5 or less a bot lies in a bed in the Shrink's room (ACTOPI) and posts `Morale: low`; in bed it gets up for fires and oxygen |
| `COMFORTS_PER_REQUEST`, comfort priority | 2, 79 | `moraleShare.ts`, `goals/comfort.ts` | Owner, 2026-11-18 (#452): the Shrink comforts each `Morale: low` asker twice, keeping the AP reserve |
| `LEAVE_SHRINK_BEDS_MORALE` | 12 | `goals/rest.ts` | Owner, 2026-11-18 (#452): at 12 or more a bot rests in a Shrink's room only if no other bed is in reach. A Shrink never lies down; it stands in the busiest bed room instead |
| `COFFEE_DRINKER`, `COFFEE_DROP_ROOM`, `COFFEE_PRIORITY` | gioele, `CORRIDOR_B`, 76.5 | `goals/coffee.ts` | Owner, 2026-11-18: crew pull the coffee in passing and leave it in the Center Corridor; Gioele drinks one reported today in passing, or fetches it in the day's last cycle; other bots don't drink coffee while he lives. Priority 76.5 is Claude's pick (above astro), not yet confirmed |
| `FIERY_SPEECH_AUDIENCE`, priority | 3, 71 | `goals/fierySpeech.ts` | Owner, 2026-11-18 (#452): once a day where the Leader stands; Leadership right after Shrink in `BOT_SKILL_RULES` |

Keep this table current: when a constant is added or the owner changes one, update its row with the date.

Astrophysicist is picked by Frieda and Gioele, then Caffeine Junkie by Gioele (owner, 2026-11-18). Bots don't pick the Firefighter skill (owner, 2026-11-14, #429; it isn't in `BOT_SKILL_RULES`).

Standing direction (owner, 2026-11-13): bots with a job of their own (Botanist, Astrophysicist, Comms Officer, Commander) do it first; fix who does what by reordering priorities before adding special cases; a bot finds things through what it saw itself or what another bot said in a fixed chat line, never through a hard-coded location.

## 4. One change per run

1. Unit-test the goal (`server/tests/goals.test.ts`) so the run measures the idea, not a bug.
2. **Smoke test on 10 seeds with `--report`** (about a minute). Check that the thing you changed moved at all (the shots, the patches, the AP line). If it didn't, the goal isn't firing; fix that before spending a full run. Check what it took the AP from as well: the first unskilled-shooting smoke test tripled the shots and killed nothing more, because Pilots took the new goal and stopped flying.
3. **The full run**, same seeds and flags as the baseline: `--seeds 1-50 --report --out docs/scratchpad/survival-<issue>-<variant>-<date>.json --compare <baseline>`.
4. Two ideas are two runs. A run with two changes can't say which one worked.

## 5. Read it honestly

- **Noise:** on 50 seeds, endings move by about ±5 ships and mean days by about ±0.2 with no real change. Inside that, say "within noise".
- **Prefer steady measures to endings:** mean hull at a fixed cycle (the by-cycle table), the budget rates, shots per cycle. They move before endings do and are far less noisy.
- **Look for what got worse:** another death cause rising, AP at the cap, a job starved (plants unwatered, no research).
- **A killer removed uncovers the next one.** Ships that stop exploding and then suffocate is progress on the hull; report it as that, and name the next killer.

## 6. Record it, negatives too

One bullet under "Reaching Eden" in `docs/plans/bot-goals.md`, in the existing style: issue and date, seeds/crew/cap/flags, the hypothesis, before → after for the numbers it targeted and for endings, your reading of why, and the saved file names. A change that didn't help gets the same bullet, with why it couldn't have worked, so nobody tries it again. Report the same numbers to the user; they decide whether it met the bar.

The saved runs are the one exception to ignoring `docs/scratchpad/`.

Then the usual finish from the `bot` skill: `leak-check` if a goal reads something new from the view or posts chat, the code map, one `docs/process/ai-workflow.md` entry (append with `cat >>`), `npm run verify`.
