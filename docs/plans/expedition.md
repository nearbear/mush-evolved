# Expeditions (plan)

2026-10-31. Phase 1 is decided by the owner (2026-10-31); the later phases are an outline, not decisions: each one gets its own rule pass (the `rule` skill) before it is built. Builds on planets and analysis (`docs/plans/astro.md`), ship travel and orbit (`navigation.ts`), and patrol ships (`docs/plans/patrol.md`).

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
- State: `Planet.sectors[i].explored` (never sent to anyone in phase 1); `GameState.expeditionReports` (members, planet name, per-event lines). Bump `STATE_VERSION`.
- `viewFor`: a report appears only in its members' views. Leak tests: a non-member never sees a report, the events or the sectors; `leakFields.ts` entries.
- Client: a report window opened from the room log line or the Icarus Bay; the takeoff button through `optionsOn`.
- Tests per the `rule` skill, plus the replay test's random inputs.

## Later phases (outline, not decided)

- **Phase 2, time away:** the crew is gone over time (until the next cycle, or one sector per cycle), can't act, and dies stranded if the ship travels or leaves orbit; the Magnetic return project; reports shareable to the crew; dirty chance on return.
- **Phase 3, the rest of the sectors and events:** the other 18 tags; Lost, Again (wandering), Lost item, Disease, Kill, Mush trap; random artifacts; real alien fruits and steaks.
- **Phase 4, gear and skills:** spacesuits and oxygen-less planets, compass, rope, drill, echolocator, thermosensor, Babel module, white flag; Diplomat, Sprinter, Polymath, Gunman, Traitor (Mush), U-turn.
- **Phase 5, launch rules:** the NERON piloting lock (anyone launches), the hold extension project (6 crew), patrol-ship solo landing (2 AP takeoff, 4 AP land, 3 sectors).
