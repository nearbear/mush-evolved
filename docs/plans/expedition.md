# Expeditions (plan)

2026-10-31. Phase 1 is decided by the owner (2026-10-31) and built; phase 2 is decided (2026-11-07, #356) and built (slices A, B and C); the later phases are an outline, not decisions: each one gets its own rule pass (the `rule` skill) before it is built. Builds on planets and analysis (`docs/plans/astro.md`), ship travel and orbit (`navigation.ts`), and patrol ships (`docs/plans/patrol.md`).

## Sources

- eMushpedia: `Expéditions`, `Évènements`, and the sector pages (`Oxygène`, `Hydrocarbures`, `Vergers`, `Prédateurs`, `Ruines`, `Température élevée`, `Atterrissage`). Read with `npm run wiki`.
- The original's data: `Mush/derived/data/DataExplore/planetTags.json` (each tag's `explo` weight and its 4 events), `explo.json` (what each event does), `monster.json`; `ICARUS_TAKEOFF` in `DataAction/actions.json` (4 AP).
- In the original, an Icarus expedition explores one sector every 10 real minutes, up to 9, and the crew can't act meanwhile. Moving the ship strands and kills the crew unless the Magnetic return project is done.

## Phase 1 decisions (owner, 2026-10-31)

1. **Icarus only.** No patrol-ship landing.
2. **Who launches:** a living **Pilot** in the Icarus Bay (`ICARUS`), while the ship orbits a planet that still has unexplored sectors. Costs 4 AP (`config.expedition.cost.ap`). Later, a NERON setting (the piloting lock) will let anyone launch.
3. **Crew:** everyone living in the Icarus Bay goes, up to 4 (`config.expedition.maxCrew`). With more in the bay, the launcher always goes and the others are picked at random. The others pay nothing. Each member brings what they carry, so the crew equips before launching (weapons count in combat). No link to on-call plans yet.
4. **Timing:** everything resolves at takeoff. The crew is back in the Icarus Bay at once, with the loot and a report. (Being away over time, and a ship that moves while the crew is out, come later.)
5. **Sectors:** a Landing event first, then up to 9 sectors (`config.expedition.sectors`), each picked from the planet's unexplored sectors by its tag's `explo` weight and marked explored (each is explored once). Only six tags have events; every other tag is explored with nothing happening.
6. **Events,** weighted 4/3/2/1 as on the wiki:

   | Sector | Events (weight) |
   |---|---|
   | Landing | Nothing (4), Fatigue (3), Accident (2), Catastrophe (1). A Pilot in the crew avoids Catastrophe. |
   | Oxygen (`OXYGEN`) | +24 oxygen (4), +16 (3), +8 (2), nothing (1) |
   | Fuel (`HYDROCARBON`) | +3 fuel (4), +4 (3), +5 (2), +6 (1) |
   | Orchard (`FRUIT_TREES`) | Harvest 3 (4), Harvest 1 (3), nothing (3) |
   | Predators (`PREDATOR`) | Fight strength 12 (4), Accident (3), nothing (2), Provision 3 (1) |
   | Ruins (`RUINS`) | Artifact (4), nothing (3), Fight strength 15 (2), Accident (1) |
   | High temperature (`HOT`) | Fatigue (4), nothing (3), Harvest 2 (2), Accident (1) |

7. **Effects:** Fatigue: every member −2 HP. Accident: one random member −3 to 5 HP. Catastrophe: every member −3 to 5 HP. Survival: −1 on each of its holder's damage. Oxygen and fuel go to the ship's stores (`ship.oxygen`, `ship.fuel`, capped as usual).
8. **Fight:** the crew's strength is +1 per member plus each carried weapon's `expoStrength` (`config.weapons`); a gun counts only loaded and unbroken; a grenade is used up if it was needed to win. A loss splits the difference as HP damage among members at random. No disease chance and no Diplomat or Gunman effect yet.
9. **Loot** lands on the floor of the Icarus Bay: Harvest gives bananas (`fruit_banana`, placeholder; +1 with a Botanist in the crew), Provision gives uncooked rations (`uncooked_ration`, placeholder for alien steaks), and an Artifact is always a starmap fragment (`super_map`).
10. **Ignored for now:** oxygen-less planets (no spacesuits yet) and getting dirty on return.
11. **Who sees it:** only the crew sees the events and the report.

12. **Log (owner, 2026-10-31):** takeoff leaves a public line in the Icarus Bay's log (who launched, to which planet). The return leaves none.
13. **Death on the expedition (owner, 2026-10-31):** a member who dies comes back on the Icarus: the body arrives in the Icarus Bay under the existing death rules. Whether their items come back too is a config option (`config.expedition.deadKeepItems`, default true; false loses them, as in the original).
14. **Explored sectors (owner, 2026-10-31):** the crew who stayed aboard, the planet's finder included, see nothing of what was explored; the members see only their report. The owner may change this later.

## Still open

Nothing for phase 1.

## Implementation (phase 1, built 2026-11-04)

Built as planned, with these readings (Claude, 2026-11-04): takeoff is refused while the ship is leaving orbit; grenades follow eMush's Fight (used one at a time while the crew is weaker, so all of them on a loss); a lost fight's damage goes point by point to random living members, and Survival takes 1 off each member's total; exploring stops once the whole crew is dead; the report goes to living members only, like private log lines; it is opened from each member's private return line in the bay.

- `shared/src/expeditions.ts`: the event tables (from the table above, in config so they are tunable), `runExpedition(state, launcher)` (pure, seeded RNG), the fight and damage helpers.
- `actions/icarus_takeoff.ts`: one action, Pilot only through a hook so the NERON setting can widen it later.
- State: `Planet.sectors[i].explored` (never sent to anyone in phase 1); `GameState.expeditionReports` (members, planet name, per-event lines), each with a default in its normalizer (`shared/src/normalizeState.ts`).
- `viewFor`: a report appears only in its members' views. Leak tests: a non-member never sees a report, the events or the sectors; `leakFields.ts` entries.
- Client: a report window opened from the room log line or the Icarus Bay; the takeoff button through `optionsOn`.
- Tests per the `rule` skill, plus the replay test's random inputs.

## Phase 2 decisions: time away (owner, 2026-11-07, #356; built)

Supersedes phase 1's item 4 (timing) and item 13's "comes back on the Icarus" timing; everything else in phase 1 stands.

1. **Pace:** one step every **10 real minutes**, in every game whatever its cycle length. The **Landing** event is the first step, at takeoff + 10 min; sector k resolves at takeoff + 10(k+1) min. The crew is back the moment the last sector resolves (Claude's reading of "Land at +10 min": a full 9-sector trip takes 100 min). In **single player** an expedition resolves instantly, as in phase 1.
2. **Length:** a base of 9 sectors (`config.expedition.sectors`), computed per expedition at takeoff so abilities (Sprinter, phase 4) can raise it later. It still ends early when the planet runs out of unexplored sectors.
3. **The Icarus is a room** while away, like a patrol ship in flight (`docs/plans/patrol.md`, "Ships are rooms"): the members are in it and in no room of the ship. Room speech, the room log, ACTOPI and private channels with people in your room follow from that. No special expedition channel. The Icarus Bay is drawn without the Icarus while it is out (Claude's reading), and takeoff is not offered.
4. **Acting while away:** whatever a patrol ship in flight allows (item actions: eating, taking and dropping, healing, `use_bandage` (#397)); nothing that needs the ship's equipment or rooms.
5. **Chat with the rest of the crew:** only with an iTrackie, as anywhere else.
6. **Report, live:** each step's lines are added to the members' report as it resolves, so members can react between sectors (owner, 2026-11-07).
7. **Public status:** the whole ship sees who is out, which planet, and the time left. Nothing else; events and members' HP stay crew-only.
8. **All members dead:** exploring stops (as in phase 1) and the Icarus comes back **at once** with the bodies and loot; the public timer ends early (owner, 2026-11-07).
9. **Death while away:** the body (a corpse item) stays in the Icarus and comes back with the loot into the Icarus Bay (`config.expedition.deadKeepItems` still governs their items).
10. **Hunters never target the Icarus** (owner, 2026-11-07): it is on the planet, out of the fight.
11. **Stranded:** if the ship travels or leaves orbit while the crew is out, the members die, unless the **Magnetic return** project (`AUTO_RETURN_ICARUS`) is done.
    - **With Magnetic return** (a deliberate change from the original, where it only brings back the empty Icarus): the crew is saved and back at once, the remaining sectors skipped; the loot lands in the Icarus Bay as on a normal return.
    - **Without it:** the crew dies, the Icarus is lost with the crew's items and loot, and there are no more expeditions this game: the Icarus Bay is drawn empty, takeoff is no longer offered, and NERON announces the loss with a ship-wide line.
12. **Warning:** a cosmetic, client-only confirm dialog on travel and leave orbit while a crew is out. It never blocks (a Mush Commander can strand the crew on purpose).
13. **Sharing reports:** its own feature (not inside Astrophysics), one entry per expedition. Any member shares from anywhere with an iTrackie, for free, as editable text like shared planets (lying is allowed). Sharing again, by the same or another member, appends to the entry's thread instead of replacing it. Feature-thread access as usual: an iTrackie to read and post; the dead read but never post. A shared report is never marked no longer applicable.
14. **Ticks while away:** nothing special; cycle effects (AP/MP gain, hunger, ...) run as usual.
15. **Dirt on return:** a base 10% chance per member (placeholder).
16. **Icarus lavatory** (`ICARUS_LAVATORY`): out of scope.

**Leaks accepted (owner, 2026-11-07):** the public time left shows how many sectors remain, and so a sector bonus such as Sprinter (someone forging a shared planet should keep its true sector count; advice, not a rule). Getting lost (phase 3) will be a public alert. Inside the crew, fight strength hints at crewmates' weapons, HP loss bounds members' HP, and Survival's reduction shows who has it. Report ids (`expedition-N`) are moot since expeditions are public.

**Slice A built (2026-11-07):** timed steps through the server's `tick`, the Icarus room (`ICARUS_CRAFT`), the public status, the live report, deaths and dirt (`docs/rules/implemented-rules.md`). Claude's readings: single player is marked by a new `instantExpeditions` override rather than manual cycles, so the dev server's End cycle games stay timed; loot lands in the Icarus while away and is unloaded on return; dirt on return respects the apron and Stickler like any dirt; the dead see the public status like everyone (it is public).

**Slice B built (2026-11-08):** stranding through `strandExpedition` (expeditions.ts) on every jump (travel, leave orbit, the warp cheat), `GameState.icarusLost`, and the client's confirm in `ShipNavigation.tsx`. Claude's readings: Magnetic return also posts a public NERON line (`icarusRecalled`), as the crew reappears in the bay anyway; on a loss the bodies go with the Icarus (they are in it); the lost Icarus shows as `out`, like an Icarus away; the confirm names the planet and says Magnetic return saves the crew, without checking whether it is done.

**Slice C built (2026-11-08):** shared reports through `shareReport` (sharedReports.ts) and a new `expeditions` feature channel; entries `sr-N` like shared planets' threads. Claude's readings: the shared planets' length limits (500 characters, 20 lines); the first share's text heads the entry and later shares are the sharer's messages in its thread, each with a system line in the feature's chat naming the planet; a member may share while still away; the share form starts from the report as text (cut to the limit); your own reports are listed in the feature so they can be shared from anywhere.

**Build order (Claude's proposal):** (a) timed steps, the Icarus room, the public status, the live report, deaths and dirt; (b) stranding, Magnetic return, the lost Icarus, the confirm dialog; (c) shared reports. Touches `expeditions.ts` (split `runExpedition` into a landing step and per-sector steps), a new timed replay input, `GameState` (an expedition in progress, a lost Icarus, each with a normalizer default), `travel` and `leave_orbit`, `viewFor` and the leak tests, `projects.ts`.

## Later phases (outline, not decided)

Each is a GitHub story with its open questions: phase 2 #356, phase 3 #357, phase 4 #358, phase 5 #359.

- **Phase 2, time away:** decided, see "Phase 2 decisions" above.
- **Phase 3, the rest of the sectors and events:** the other 18 tags; Lost, Again (wandering), Lost item, Disease, Kill, Mush trap; random artifacts; real alien fruits and steaks.
- **Phase 4, gear and skills:** spacesuits and oxygen-less planets, compass, rope, drill, echolocator, thermosensor, Babel module, white flag; Diplomat, Sprinter, Polymath, Gunman, Traitor (Mush), U-turn.
- **Phase 5, launch rules:** the NERON piloting lock (anyone launches), the hold extension project (6 crew), patrol-ship solo landing (2 AP takeoff, 4 AP land, 3 sectors).
