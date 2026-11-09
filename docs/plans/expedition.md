# Expeditions (plan)

2026-10-31. Phase 1 is decided by the owner (2026-10-31) and built; phase 2 is decided (2026-11-07, #356) and built (slices A, B and C); phases 3 and 4 are decided (2026-11-08, #357, #358), slices A, B and C built; phase 5 is an outline, not decisions: each one gets its own rule pass (the `rule` skill) before it is built. Builds on planets and analysis (`docs/plans/astro.md`), ship travel and orbit (`navigation.ts`), and patrol ships (`docs/plans/patrol.md`).

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

## Phases 3 and 4 decisions: events, gear and skills (owner, 2026-11-08, #357, #358; slices A, B and C built)

One rule pass for both phases. Everything in phases 1 and 2 stands except where a point below says it replaces something. Sources: the original's `planetTags.json`, `explo.json`, `monster.json`, `objects.json`, `blueprints.json`; eMushpedia's `Expéditions`, `Évènements` and sector pages; eMush through `npm run emush`.

### Events and tables

1. **Tables:** the original's 4 events per tag, weighted 4/3/2/1 (they match eMushpedia), numbers included, for the 16 tags without events and the new Lost sector:

   | Sector | Events (weight 4 / 3 / 2 / 1) |
   |---|---|
   | Forest | Harvest 2 / Again / Disease / Lost |
   | Mountain | Accident / Fuel 1 / Fatigue / Harvest 1 |
   | Swamp | Disease / Harvest 2 / Fatigue / Nothing |
   | Desert | Again / Fatigue / Nothing / Nothing |
   | Ocean | Nothing / Provision 3 / Nothing / Lost |
   | Cave | Fuel 2 / Accident / Again / Artifact |
   | Ruminant | Provision 4 / Provision 2 / Accident / Fight (Chab Chab, 8) |
   | Predator (built) | Fight (Skinner, 12) / Accident / Nothing / Provision 3 |
   | Intelligent life | Fight (Cortic, 12) / Provision 2 / Artifact / Lost item |
   | Insect | Accident / Disease / Provision 1 / Fight (Beetle-thug, 10) |
   | Mankarog | Kill / Fight (Mankarog, 32) / Back / Artifact |
   | Cold | Nothing / Fatigue / Lost / Accident |
   | Strong wind | Nothing / Fatigue / Nothing / Lost item |
   | Seismic activity | Nothing / Back / Accident / Kill |
   | Volcanic activity | Nothing / Nothing / Back / Kill all |
   | Ruins (built) | Artifact / Nothing / Fight (Alien zombies, 15) / Accident |
   | Wreck | Artifact / Fuel 3 / Nothing / Fight (random: 8, 10, 12, 15, 18 or 32) |
   | Crystal field | Mush trap / Starmap / Fight (Mindbender, 18) / Lost |
   | Lost (new) | Found / Found / Again / Found dead (so 7 / 2 / 1) |

2. **Cancelled and avoided:** a skill or item that *cancels* an event sets its weight to 0 and the sector rolls among its other events; one that *avoids* it lets it happen with no effect. If every weight is 0, the sector is Nothing.
3. **Again:** nothing happens and the sector is not marked explored, so it can come up again; the step is used.
4. **Back:** the expedition ends at once and the crew comes home with what it found.
5. **Lost item:** one item, picked uniformly among every item carried by members still with the crew (never a spacesuit), is destroyed. Nothing carried: Nothing.
6. **Kill:** one random member still with the crew dies; Survival holders are picked last. **Kill all:** every member still with the crew dies; nothing prevents it. Deaths follow the existing expedition death rules.
7. **Disease:** reads as Nothing until Diseases (#214); no disease chance after fights either.
8. **Mush trap:** each human member still with the crew independently has 50% (`config.expedition.mushTrapChance`) to gain 1 spore, secretly; the report only says the crew walked into a trap. Antique Perfume's immunity protects; a Mush member is unaffected.
9. **Landing** (replaces phase 1's Pilot rule): a living Pilot in the crew or the Antigrav propeller project (`ICARUS_ANTIGRAV_PROPELLER`) makes the landing always Nothing.

### Fights (replaces phase 1's item 8)

1. **Crew strength:** 1 per member still with the crew plus weapons as in phase 1, plus Shooter and Centauri (below).
2. **Damage:** the shortfall (creature − crew strength, counting every carried grenade whether spent or not), split point by point among members at random, win or lose. Survival still takes 1 off each holder's total.
3. **Grenades:** spent one at a time only while the strength without them is below the creature's (as now).
4. **Win chance:** 0 below half the creature's strength, then (crew − half + 1) / (creature − half + 1), capped at 1. A win gives the fight's loot; a loss gives nothing more.
5. **Creatures** are named in the report (Chab Chab, Beetle-thug, Skinner, Cortic, Alien zombies, Mindbender, Mankarog).
6. **Win loot** (owner's choice, not eMush's): Chab Chab 2 steaks; Beetle-thug 1 steak; Skinner 2 steaks; Cortic 1 artifact; Alien zombies 1 artifact; Mindbender 1 starmap fragment; Wreck's creature 1 artifact; Mankarog 4 steaks and 1 artifact.

### Loot

1. **Artifacts:** one picked uniformly from the original's 9: Magellan liquid map, rock mount, alien oil, water stick, printed-circuit jelly, alien holographic TV, invertebrate shell, alien bottle opener, starmap fragment (`super_map`). The 7 new ones are inert items (art from `Mush/`); their effects are later stories.
2. **Food:** bananas and uncooked rations stay as placeholders; Provision gives +1 steak per Survival holder still with the crew.

### Lost

1. **Getting lost:** one random member still with the crew and without a compass leaves the crew and stays on the planet, in a place of their own; the planet gains a Lost sector. If every member carries a compass, Lost is cancelled.
2. **While lost:** no actions except actions on their own items (eat, bandage, ...); room speech reaches nobody; iTrackie chat works as anywhere; cycle effects run as usual. Their report stops at the line where they got lost.
3. **Public alert:** names the lost member and the planet (phase 2 accepted this leak).
4. **Found:** a later step of the same expedition or a later expedition to that planet can draw the Lost sector. Found: they join that crew (even over the cap of 4) and come back with it. Found dead: they die. A Tracker with the crew cancels Found dead.
5. **Left behind:** after the Icarus returns, a lost member stays on the planet; if the ship travels or leaves orbit they die (Magnetic return does not save them).
6. **The last member gets lost:** the expedition ends and the Icarus comes back with the loot and any bodies, as when all members die.

### Gear

All eMushpedia's effects. One working, unbroken copy carried by a member still with the crew is enough; copies don't stack; nothing is used up.

1. **Spacesuit:** a planet with no Oxygen sector, revealed or not, needs one. A member without one stays in the Icarus: they don't explore, events can't touch them, and their items don't count. If nobody has one, the expedition ends at once and the 4 AP stays spent.
2. **Compass:** cancels Again; its bearer can't be picked for Lost.
3. **Rope:** its bearer avoids an Accident in Cave, Mountain and Seismic activity.
4. **Drill:** doubles the fuel from fuel events.
5. **Echolocator:** Hydrocarbon sectors are 5× as likely to be picked. **Thermosensor:** Insect, Mankarog, Lost, Predator, Ruminant and Intelligent life sectors are 5× as likely.
6. **Babel module:** Artifact is twice as likely in Intelligent life. **White flag:** cancels Fight in Intelligent life.
7. **Where gear comes from:** spacesuits (6), the compass, ropes (4) and the drill in the fixed start list; blueprints for the echolocator, thermosensor, Babel module and white flag in the start list, with the original's recipes. Rooms and recipes (owner, 2026-11-08, at slice C): 6 spacesuits in the Icarus Bay; the compass, ropes and drill in front storage; the four blueprints in the front corridor with stand-in scraps (3 metal, 3 plastic) and an old T-shirt (a new inert item) in the Alpha dorm by the soap. Recipes from the original's weighted list: echolocator, thermosensor (`HEAT_SEEKER`, which is in `blueprints.json` after all) and Babel module 1 metal + 1 plastic scraps each; the white flag an old T-shirt and soap.
8. **Spacesuit check (owner, 2026-11-08):** once, at takeoff. (The owner added that items can't be dropped on an expedition and nothing breaks in an inventory; the drop rule is not built yet, see slice C.)

### Skills

1. **Diplomat:** cancels Fight in Intelligent life only, like the white flag (owner's change from eMush, where it cancels every fight). **Polymath:** the Diplomat's effect and the Botanist's +1 fruit.
2. **Shooter (`gunman`):** +1 strength per Shooter carrying a working gun (once each).
3. **Sprinter (`sprint`):** +1 sector per Sprinter in the crew at takeoff.
4. **Tracker (`hunt`):** cancels Found dead ("Lost", item 4).
5. **Centauri:** once the Centauri rebel base is contacted, each working blaster on an expedition adds 1 strength.
6. **U-turn (`fast_backward`):** a holder on the expedition ends it for 2 AP; the crew comes back at once with what it found; lost members stay lost. A report line names who turned back (crew only); the public timer just ends.
7. **Traitor (Mush):** a Traitor on the expedition has a free, secret Sabotage action, once per expedition. From the next step on, every sector rolls only its negative events (Nothing if it has none), and a Crystal field is always a Mush trap. Nothing records it anywhere. Negative, per eMushpedia's `Évènements`: Fatigue, Accident, Catastrophe, Fight (not in Ruins), Disease, Lost item, Lost, Found dead, Mush trap, Kill, Kill all, Nothing in an Oxygen sector, Oxygen 8, and Fuel 3 in a Hydrocarbon sector. Not negative: Again, Back, every other Nothing, and all other gains.

**Build order:** (A) tables, the new kinds, fights and their loot, creatures, the inert artifacts, Survival's steak, landing safety; (B) Lost: the Lost sector, the lost member's place, the alert, finding them, dying when the ship leaves, Tracker; (C) gear and spacesuits: items, placement, every gear effect; (D) skills: Diplomat and Polymath, Shooter, Sprinter, Centauri, U-turn, Traitor. One commit per slice.

**Slice A built (2026-11-08):** the tables, the new kinds, fights with creatures, the win roll and loot, random artifacts (7 new inert items), Survival's steak, the safe landing. Claude's readings: "half" a creature's strength rounds down (only 15 is odd; eMushpedia's tables for 10 and 32 match); the Wreck's creature is the vessel's pilot (eMush's line), its strength uniform among the six; Lost reads as Nothing until slice B, like Disease; Lost item can take any carried item, iTrackie included; Kill goes through `damage` (so the dev `infiniteHp` cheat survives it); the Mush trap goes through `contaminate`, so the Mush channel's usual "contaminated" line names the human, as for any spore.

**Slice B built (2026-11-08):** getting lost, finding the lost and dying when the ship leaves (`getLost`, `find`, `abandonLost`, `lostPlayers`, `withCrew` in expeditions.ts; `lostPlace`/`isLostPlace`/`offShip` in patrol.ts; `PlayerView.lost`; `LostPanel.tsx`). Claude's readings: the lost member's place is a per-player room `LOST:<playerId>`, outside `config.rooms` (no doors or equipment; build, install and ignite are blocked there); Found picks uniformly among everyone lost on the planet (as eMush); when someone gets lost, the steps left are redrawn with the new Lost sector in the running rather than drawn lazily step by step (same odds, no state version bump; side effect: a sector that rolled Again this trip can come up again after the redraw); Found dead goes through `damage`, so the dev `infiniteHp` cheat survives and is found alive; the found member joins the report's members and crew and sees the whole report, events from before they were found included (confirmed by the owner, 2026-11-08, as the simpler option); the public alert is a NERON warning line (`crewLost`) plus `PlayerView.lost` shown on the ship card, as there is no alerts backend yet; the public expedition status still lists the lost member in its crew; the report cut (`ExpeditionReport.lostAt`) is applied in `viewFor` and never sent; a lost place never appears in `PlayerView.unidentified` (it names the player; `lost` covers them); gating Lost on the compass waits for slice C.

**Slice C built (2026-11-08):** the gear items and their effects (`config.expedition.gear`), the spacesuit check (`ActiveExpedition.suitless`, `explores`), the start list and the four recipes. Claude's readings: members left in the Icarus get a `noSpacesuit` report line each and nobody suited gives a `grounded` line; a grounded crew doesn't roll for dirt; a Pilot without a suit still makes the landing safe (they fly the Icarus); the expedition comes back once nobody is left exploring; the finders apply when the sectors are drawn (at takeoff, and on a redraw); a rope's save is a report line (`avoided`); a drill doubles the fuel before the ship's cap; the white flag and Babel module use their sector's tag in config. Dropping items aboard the Icarus is still allowed (phase 2, item 4), pending the owner's word.

## Later phases (outline, not decided)

Each is a GitHub story with its open questions: phase 2 #356, phase 3 #357, phase 4 #358, phase 5 #359.

- **Phase 2, time away:** decided, see "Phase 2 decisions" above.
- **Phases 3 and 4:** decided, see "Phases 3 and 4 decisions" above. Still later: real alien fruits and steaks (Botany pass 2), Disease events (#214), the artifacts' effects.
- **Phase 5, launch rules:** the NERON piloting lock (anyone launches), the hold extension project (6 crew), patrol-ship solo landing (2 AP takeoff, 4 AP land, 3 sectors).
