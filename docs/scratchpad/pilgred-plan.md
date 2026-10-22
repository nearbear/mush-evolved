# PILGRED: what the original gives us, and a plan (draft)

Status: **pass 1 (repair) built 2026-10-21**; pass 2 (return to Sol) not built (Claude, 2026-10-21). Five decisions received from the owner on 2026-10-21 (see "Decisions"); the rest is open. Everything under "What the original gives us" is extracted from `Mush/` and is reference only. Nothing here is a rule until the owner answers the open questions and the answers go into `docs/rules-design.md`.

## Why it matters

PILGRED is the Daedalus's faster-than-light reactor, invented by Raluca, broken when the game starts. Repairing it is what lets the ship go home. The win conditions are already decided (`docs/rules-design.md`, "Win conditions"): Mush win if all humans die, or if the ship returns to Sol while any Mush is alive; humans win if it returns to Sol with no Mush alive. So PILGRED, plus the "return to Sol" action it unlocks, is the missing half of the win conditions (#27) and of the MVP's "win or lose" loop (`docs/mvp-plan.md`).

## What the repo already has

- `PILGRED` equipment in `MOTOR_ROOM` (`shared/src/equipment.ts`, `terminal: true`; id `MOTOR_ROOM:PILGRED` in `Mush/derived/ship-rooms.json`). `access` opens a blank `TerminalDialog`.
- The `pilgred` resource (`RESOURCE_IDS` in `shared/src/resources.ts`), always 0, with en/fr/es name and description ("PILGRED points give you free actions on repairing PILGRED").
- The `physicist` skill id (`shared/src/skills.ts`), no effects; its en/fr/es text is in the locales.
- The `pilgred` feature chat channel (`FEATURE_CHANNELS`), with the `pa_pilgred` icon.
- The Command terminal is `PILOT_MODULE` in `COMMAND_CENTER`, and titles (`commander` etc., `shared/src/titles.ts`) are built.
- NERON projects (`actions/project.ts`) and research are the closest built pattern: a percent in `GameState`, 2 AP per action, Computer points make it free.

## What the original gives us

The snapshot has data tables and the shared Haxe helpers, not the server logic, so we have numbers and formulas but not the action bodies.

### Equipment (`DataExt/objects.json`, `Data/rooms.json`)

- `PILGRED`, "Pilgred": "The PILGRED reactor. The only known way to travel faster than light when the Daedalus left. Repairing it may let you return to Sol." Starting status `EQUIPMENT,MODULE_ACCESS` (a terminal you access). Only action: `REPAIR_PILGRED`. Background flavour (`objects_background.json`): "Tear your space-time safely."
- `EMERGENCY_REACTOR`: "Lets the Daedalus move forward if PILGRED fails." No actions. Tutorial text says the emergency reactor (the middle one of three) is running only because PILGRED is down.
- `MOTOR_ROOM` holds `COMBUSTION_CHAMBER_ACCESS, STELLAR_ANTENNA, PLANET_SCANNER, EMERGENCY_REACTOR, ROTATIONAL_REACTOR ×2, PILGRED`.
- `PILOT_MODULE` ("Terminal de Commandement"): actions `ADVANCE_SHIP, CHANGE_SHIP_ORIENTATION, SET_PILGRED_TO_SOL, SET_PILGRED_TO_EDEN`; effect `CheckAccess( HasTitle( COMMANDER ))`, so only the Commander can use it.
- `PILGRED_SYNTH` ("Tetrathésieur PILGRED"): "Produces a Ration, a Fruit, or a Medicine each day." No source says how it is obtained; unrelated to the repair.

### Actions (`DataAction/actions.json`, `DataAction/fake.json`)

| id | cost | name | notes |
|---|---|---|---|
| `REPAIR_PILGRED` | 2 AP | "Participer" (Take part) | "Repairing PILGRED will let you return to Sol." `dirt` 25 (25% dirty), `hurt` 5 (5% injury, cf. #207), no success roll (`proba` empty), colour `PILGRED` (so PILGRED points pay for it), sector `Pilgred`, `mush_confirm: true` (a Mush gets a confirm prompt: they are helping the humans go home), tracked, public (not stealth/discrete). Refused when `IsPilgredOk`: "Pilgred is already operational." |
| `SET_PILGRED_TO_SOL` | 2 AP | "Rentrer sur Sol" (Return to Sol) | "After all this time, maybe it's time to see what's happening on Sol." At the Command terminal. Confirm dialog: "This action has heavy consequences. Are you sure?" Refused when `Not(IsPilgredOk)` or the ship has no PILGRED: "Pilgred is not operational." Success text: "You took the Daedalus to Sol." |
| `SET_PILGRED_TO_EDEN` | 2 AP | "Voyager vers Eden" | Needs `IsEdenComputed` (the `COMPUTE_EDEN` action, 33%, ×1.25 per failure) and a working PILGRED. Irreversible confirm. Eden is not in our win conditions. |

### Progress formula (`Solver.calcPilgredProgres`, `Gameplay.hx`)

PILGRED uses the same `getBaseProgress` as NERON projects and research:

```
base = int(DIG_RATE * PILGRED_MOD / 10)   // DIG_RATE = 6, PILGRED_MOD = 2  → 1
base += DIG_BOOST for each of the actor's skills in PILGRED_TAGS   // DIG_BOOST = 4, tags = ENGINEER, PHYSICIST
base -= 2 * touches          // touches = how many times in a row this same player was the last to work on it
base = max(base, 0)
progress gained is in [base, base + base/2]  (integer halves)
```

So per action, before repeats:

| actor | gain per action |
|---|---|
| no skill | 1% |
| Engineer or Physicist | 5–7% |
| Engineer and Physicist (Raluca has both) | 9–13% |

For comparison, a NERON project with `mod` 30 starts at a base of 18. PILGRED is meant to be a long crew-wide grind (the tutorial calls it "a slow task"). At 1% a time, an unskilled crew needs 100 actions (200 AP). The repeat penalty means a non-specialist gains nothing on their second action in a row, and a specialist's gain drops by 2 each time, so it pays to take turns. Whether `touch` resets when someone else works, or per day, isn't in the snapshot; the project code only checks `hero.id == touch.id`, which suggests it resets when someone else works.

Projects get extra boosts (NERON BIOS priority, the NERON_ONLY_FRIEND skill); PILGRED gets none in the snapshot.

### PILGRED points and the Physicist (`Data/skills.json`, `Data/PAColors.json`)

- Physicist: `IncrMaxPA( PILGRED , 2 ) + IncrPAPerDay( PILGRED , 1 )`: holds up to 2 PILGRED points and gains 1 per day. "Grants 1 PILGRED repair action point per day. Bonus for developing certain NERON Projects."
- "PILGRED points give you free actions for repairing PILGRED" (colour `PILGRED`, icon `pa_pilgred.png`). Same mechanism as Computer points for research.
- Engineer gets no PILGRED points, only the progress bonus (its +1 point per day is for repairs).

### Repaired state and what it unlocks

- `IsPilgredOk` condition, `PilgredUnlocked` ship flag (`CrossConsts.hx`). The iso client swaps the `core_pilgred` tile in MOTOR_ROOM for the animated `core_pilgred_upgrade` (6 frames) when the flag is set (`clients/iso/xml/upgrades.xml`; slices in `tiles.xml`). The terminal itself is the `pilgred_console` slice.
- Unlocks `SET_PILGRED_TO_SOL` / `SET_PILGRED_TO_EDEN` at the Command terminal. NERON's completion line (`events.json`, `PILGRED_DONE`) says "Long-range access opened", which hints PILGRED also powers long-distance travel; travel isn't built here.
- The coffee machine text says that without PILGRED you only get one coffee per 24 hours, which suggests more coffee after repair; no data backs this up.
- The DRUG_DISPENSER research's flavour mentions PILGRED overloads; flavour only.

### Log lines (`DataEvents/events.json`)

- `PILGRED_PROGRESS`: "$h has advanced the repair of PILGRED." (room log)
- `PILGRED_DONE`: a NERON announcement in three moods (`line_inhib`, `line_crazy`, `line_evil`), e.g. inhibited: "*PILGRED repairs* completed by $s. ||Long-range access opened.||"
- `PILGRED_DONE_ALIEN`: the same when aliens repaired it (merchant trade, below).

### Triumph and trophies

- Raluca's `PILGRED_MOTHER` (`heros.json`, `glory_event.json`): +2 triumph (heros.json says +1) for each 20% step of PILGRED repair, whoever does it.
- `CM_PILGRED` "Pilgredissime": earned by everyone when PILGRED is repaired (score 0).
- Trophy counter `pilgred_back_online` (`DataEco/trophies.json`).
- Triumph isn't built here, so these are reference only.

### Merchant trade (`DataEvents/trade_events.json`, #143)

`PILGREDISSIM`: an alien merchant offers to repair PILGRED (`Tradable.RepairPilgred`) for 3 random crew members, or, with the Diplomacy skill, for 24 oxygen capsules + 24 fuel capsules. Completing it this way posts `PILGRED_DONE_ALIEN`. Depends on the merchant ship, which isn't built.

### Other references

- `projets.json` DISMANTLING project: "dismantling Raluca's failed PILGRED experiments" spawns 5 metal scraps in the engine room. Flavour only.
- Tutorial objectives `GO_PILGRED`, `PILGRED_PHYSICIST`, `PILGRED_ENGINEER` (`DataExt2/objectives.json`) steer Engineers and Physicists to the engine room: "Select the *Pilgred*, click *Access*, then *Take part*." So in the original, repair happens inside the terminal window.
- Mush chant in `dataGen.xml`: "PILGRED VA SAUTERRRRR" (PILGRED's going to blow). Flavour only; no sabotage action exists in the data.
- Art: `www/img/cards/pilgred.png` (card), `www/img/icons/ui/pa_pilgred.png` (point icon, already wired), `www/img/art/site/rooms/motor_room.jpg`, tiles `pilgred_console`, `core_pilgred`, `core_pilgred_upgrade`.

### What the snapshot doesn't tell us

- How `touch` grows and resets (per streak, per day?).
- Whether the gain is a uniform roll in [min, max].
- Whether a Mush's repair counts the same (the confirm suggests yes).
- What actually happens on arrival at Sol (scoring and end screens are server-side).
- Whether PILGRED can break again (the emergency reactor text "in case of PILGRED failure" hints at it; no data).

## Decisions (owner, 2026-10-21)

1. **Progress:** the original's slow formula (1% base, +4 per Engineer/Physicist, repeat penalty, gain in [min, min + min/2]).
2. **Mush can repair PILGRED.**
3. **Mush can return to Sol** (a Mush holding the Commander title can fly home, which is a Mush win under the decided win conditions).
4. **Vacant Commander title:** the alternative is the hacker kit, which isn't built yet. Until it is, nobody can return to Sol while the title is vacant.
5. **Returning to Sol ends the game immediately**, applying the decided win conditions.
6. **Relaying:** the repeat penalty resets the moment someone other than the previous contributor makes progress. The same concept applies to research and projects (not now; recorded in `docs/rules-design.md`).
7. **Progress is seen only at the PILGRED terminal** (in the engine room). Each repair is a public room log line. Dirty players can repair; 25% dirty chance; no injury until #207; no Mush confirm prompt. Physicist points and the Engineer/Physicist bonus are built now. Everything under "Later" stays later. All open questions are answered (2026-10-21).
8. **Completion:** a crew-wide system message in global chat plus a room log line.
9. **Return to Sol:** a button at the Command terminal, 2 AP, with a confirm dialog.

## Open questions for the owner

1. ~~Progress per action~~: decided, the original's formula.
2. **Repeat penalty:** keep the "−2 per repeat in a row by the same player, reset when someone else works on it" reading?
3. ~~Who can repair~~: decided, Mush included. Still open: living and not dirty (as for research), and should a Mush get a confirm prompt like the original's `mush_confirm`?
4. **Dirty and hurt:** 25% chance to get dirty (like research). The 5% injury depends on #207 (random accidents): skip it until #207 is decided?
5. **PILGRED points:** build the Physicist's +1 per day (max 2) now, with points making a repair free like Computer points? And Engineer/Physicist's progress bonus now, or only the hook (as for Astro)?
6. **Visibility:** progress public to everyone (like research and projects), or only seen at the terminal? Repair log line public in the room?
7. **Completion:** a crew-wide NERON-style announcement (until NERON exists, a system message in global chat, as for deaths) plus a public room log line? Which of the three NERON moods, or a plain line?
8. **Return to Sol:** at the Command terminal (`PILOT_MODULE`), Commander only, 2 AP, with a confirm dialog (the original's values)? Vacant title and Mush Commander are decided (see Decisions).
9. ~~Ending the game~~: decided, it ends at once with the decided win conditions.
10. **Eden:** out of scope (no `COMPUTE_EDEN`, no `SET_PILGRED_TO_EDEN`)?
11. **Breaking again, sabotage, the visual swap, coffee, Raluca's triumph, alien repair:** all later?

## Planned implementation (draft, pending the open questions)

Small enough for one rule pass with the `rule` skill; return to Sol and game end are a second pass because they touch win conditions (#27).

### Pass 1: repair

- `shared/src/pilgred.ts`: `PILGRED_COMPLETE = 100`, `pilgredGain(state, player, rng)` implementing the formula from `config.pilgred` (`baseRate`, `skillBoost`, `skills: ["engineer", "physicist"]`, `repeatPenalty`), and `isPilgredRepaired(state)`.
- State: `GameState.pilgred: { progress: number; lastBy: PlayerId | null; streak: number }` (plain JSON). Bump `STATE_VERSION`.
- `shared/src/actions/repair_pilgred.ts`, following `project.ts`: candidates at `PILGRED` equipment in your room while progress < 100; `getCost` 0 AP when `resources.pilgred > 0` (spent), else `config.pilgred.cost.ap` = 2; `dirtChance` = `config.pilgred.dirtyChance`; validate dead/dirty/done (codes `cant_repair_pilgred`, `pilgred_done`, `dirty`); `apply` adds the gain, updates the streak, logs `pilgredRepaired` (public, with percent) or `pilgredDone`, and on completion posts the crew-wide announcement.
- Physicist modifier (`shared/src/modifiers/physicist.ts`, like `computer.ts`): +1 `resources.pilgred` per day, capped at `config.pilgred.capPoints` = 2. Update `SKILL_STATUS` (`physicist: "partial"`: points only, no NERON project bonus) and note engineer's PILGRED bonus.
- `viewFor`: progress is not public (decided); who gets `PlayerView.pilgred` depends on question 6. Nothing about who worked on it beyond the log. Run `leak-check` (the streak's `lastBy` must not be sent).
- Web: the Pilgred `TerminalDialog` gets the card art, a progress bar and a Repair button from `view.actions` (uses the existing terminal kit look, #161). Works at 360px. Log and announcement strings through i18n (en/fr/es; French from `events.json`).
- Tests (`shared/tests/pilgred.test.ts`): pinned config numbers; gain per skill combination; the repeat penalty and its reset; floor at 0; clamped at 100; point spent before AP; illegal actions leave state unchanged; Physicist points per day and cap; completion log and announcement; leak test.

### Pass 2: return to Sol and game end (with #27)

- `shared/src/actions/return_to_sol.ts` at `PILOT_MODULE`, offered only when `isPilgredRepaired` and only to the current Commander (Mush included); nobody while the title is vacant. Leave a seam (one `canReturnToSol` check) for the hacker kit to add its route later.
- Game end: `GameState.phase = "ended"` with the winner from the decided rule, checked in the same action; everyone's view shows the result. The end screen and revealing names (#191) are their own issues.
- Tests: each win branch (Mush alive, no Mush alive), a Mush Commander can return, refused before repair, refused for a non-Commander, refused while the title is vacant, nothing more happens after the game ends.

### Later (not in the slice)

PILGRED breaking again and the emergency reactor; travel; Eden; the `core_pilgred_upgrade` tile swap in the Pixi renderer (asset skill); coffee changes; triumph; the alien merchant repair.

## After it's built

Record it in `docs/implemented-rules.md`, `docs/rules-design.md` ("Decisions received"), `docs/code-map/shared.md`, and append to `docs/ai-workflow.md`. Close or update #27.
