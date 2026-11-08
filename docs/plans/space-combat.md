# Hunters and space combat (plan)

Status: **first-pass rules decided 2026-10-24 (recorded in `docs/rules/rules-design.md`, "Hunters and space combat, first pass"); Phase 1 built 2026-10-24 (`docs/rules/implemented-rules.md`, "Hunters and space combat, first pass").** Deferred: hunters following on travel (#240), wave scaling with crew size and activity (#241). Everything under "What the original gives us" is extracted from `Mush/` (2026-10-20) and is reference only. Nothing here is a rule until the owner answers the open questions and the answers are recorded in `docs/rules/rules-design.md`.

## What the snapshot does and doesn't have

The snapshot has the data tables, the shared Haxe helpers (`Solver.hx`, `Utils.hx`, `Gameplay.hx`, `Protocol.hx`) and the Flash client's battle panel (`Mush/clients/iso/src/ui/SpaceBattle.hx`). It does **not** have the server simulation: there is no `HunterLogic`, no `ShipLogic.hurtHull` body, no wave spawner, and no hunter AI. So we know the numbers, the targets a hunter can have, the player actions and their odds, and the log lines. We don't know how waves are sized and timed, how a hunter picks a target, how hit chance meets dodge, or how charges recharge. Those are open questions below, not things to fill in from memory.

## What the original gives us

### Ship stats (`Mush/derived/data/Data/ships.json`, `Protocol.ShipStatsData`)

Live rows, before `$EOF`. The `aggro` hunter types are the ones that attack. `aggro_pool_cost` is what each one costs to bring in (see Waves). `max_nb` caps how many can be in play at once.

| id | name | life | atk | hit | dodge | charge | armor | pool cost | max | weight | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| HUNTER | Hunter | 6 | 2–4 | 80 | 50 | | 0 | 10 | | 100 | the standard Federation fighter |
| SPIDER | Arack | 6 | 1–3 | 40 | 60 | | 0 | 20 | 2 | 10 | stops the Daedalus from travelling (`SHIP_SPIDER_TRAILING` log) |
| ASTEROID | Astéroïde | 20 | 0 | 100 | 20 | 6 | 0 | 25 | 2 | 10 | doesn't shoot or follow; "in $c cycles it hits the Daedalus for $dmg", where the client fills $c from `charges` and $dmg from its **hp** |
| DICE | D1000 | 30 | 3–6 | 60 | 20 | | **1** | 30 | 1 | 10 | super cruiser: "attacks 3 times per cycle", doesn't follow |
| TRAX | Trax | 10 | 2–3 | 50 | 50 | | 0 | 20 | 2 | 20 | elite interceptor: "impossible to outrun" |
| TRANSPORT | Transport | 16 | 0 | 80 | 50 | | 0 | 20 | 2 | 20 | not aggro; opens a trade interface (merchant trades, #143) |
| PATROLSHIP | Patrouilleur | 10 | 3–6 | 40 | 75 | 10 | 0 | | | | our fighter; capacity 1 |
| PASIPHAE | Pasiphae | 12 | 0 | 0 | 75 | 0 | 0 | | | | salvage ship, can't shoot; capacity 3 (#147) |
| TURRET | Tourelle | | 2–4 | 30 | | 4 | 0 | | | | capacity 1 |
| DAEDALUS | Daedalus | 100 | | | 200 | | 0 | | | | the hull; "dodge 200" |
| ICARUS | Icarus | 20 | | | 100 | | 0 | | | | exploration ship, capacity 4 |

"Follows" (`Ne poursuit pas`, `Impossible à distancer`) is about the Daedalus travelling: hunters chase it to the next system unless the type says otherwise. Travel is built (`docs/rules/implemented-rules.md`, "Ship travel"), and plain hunters follow it (#240, decided 2026-10-24: half, rounded up, keeping their hp).

Constants: `Const.MAX_PATROL_HP = 14` (more than the table's 10, so repairs can overfill?), `Gameplay.PATROLSHIP_EXTRA_AMMO = 6`, `Gameplay.HUNTER_PER_SHIP = 4` (use unknown), `Gameplay.ARMOUR_CORRIDOR = 1`, `Gameplay.PATROL_EXP_TICKS = 3` (patrol-ship planet trips, out of scope), `Const.ENABLE_HUNTERS = true`. `ShipConsts` lists `PATROL_SHIP_FREE_MOVES` and `DAEDALUS_SHIELD_REGEN` but their values aren't in the snapshot.

### Hunter states (`Protocol.HunterState`)

`Move`, `LockPatrol(room)`, `LockHunter(id)`, `LockDaedalus`, `LockTransport(id)`, `Stalled`. `LockRoom`, `LockHuman` and `LockEquipment` are marked deprecated. So each hunter, each cycle, is either moving, stalled, or locked onto the Daedalus, a patrol ship, another hunter (the Fungus Scrambler research) or a transport. The log has `HUNTER_POOLED` ("injection of"), `HUNTER_RELEASED` ("release of"), `HUNTER_MOVED`, `HUNTER_LOCKED` ("acquired a new target"), `HUNTER_HIT`, `HUNTER_MISS`, `HUNTER_DEAD`. That reads as: hunters are bought into a hidden pool, released into the battle, then each cycle pick a target and shoot.

### Player actions (`DataAction/actions.json`)

`cost` is AP. `proba` is the success chance; `fail_coef` multiplies it on each repeat of the same action (see Odds). `dirt` and `hurt` are the chances, in percent, of getting dirty or injured doing it (the injury side is #207, Random Accidents).

| action | cost | odds | where / gate | what it does |
|---|---|---|---|---|
| `TURRET_ATTACK` | 1 | 30%, ×1.25 | `TURRET_COMMAND` (6 turret rooms) | fire one charge at a hunter |
| `PATROL_SHIP_TAKEOFF` | 2 | see below | `PATROL_INTERFACE` in a bay; hurt 2% | board a patrol ship and appear in space |
| `PATROL_SHIP_ATTACK` | 1 | 40% (stance), ×1.25 | `PATROL_COMMAND`, detached | fire one charge at a hunter; "upgradable with missiles" |
| `PATROL_SHIP_LAND` | 2 | | detached | return to the ship's bay (`MONOPLACE_LAND` log) |
| `PATROL_SHIP_EJECT` | 1 | | detached; dirt 25%, hurt 25%; confirm dialog | eject: the patrol ship is destroyed and you float in a `LIFE_CAPSULE` that someone must retrieve (`EJECT_FORCED`, Pasiphae `PASIPHAE_RESCUE`) |
| `PATROL_CHANGE_STANCE` | 1 | | `HasSkill(PILOT)` | pick a stance (below) |
| `REPAIR_HULL` | 1 | 25%, ×1.25 | holding `METAL_SCRAPS`; dirt 25%, hurt 5% | "Armure +qty" (`REPAIRED_HULL`); the amount isn't in the snapshot |
| `REPAIR_PATROL_SHIP` | 2 | 12%, ×1.25 | `PATROL_INTERFACE`, in a `SPACESHIP_BAY`, needs a metal scrap; dirt 25%, hurt 5% | restore a patrol ship |
| `PATROL_SHIP_PLANET_LAND`, `ICARUS_TAKEOFF`, `PASIPHAE_*` | | | | exploration and salvage: out of scope (#147) |

**Takeoff** (`Solver.evalPatrolShipLandTakeOff`): a pilot always succeeds. Otherwise `pc = 20` plus `IncrActionOdd`/`MulActionOdd` modifiers (`BAY_DOOR_XXL` ×1.5), and **unless** a `pc`% roll comes up, the takeoff is rough: the hull takes 2–4, the patrol ship 1, the pilot 0–2. The takeoff happens either way. As written that's an 80% chance of a rough takeoff for a non-pilot, which may be inverted; it needs confirming.

**Stances** (`Utils.stanceData`): base hit = `PATROL_SHIP_ATTACK.proba` (40), evade 50, attract 15, lock true.

- `Attack`: hit ×2.
- `Flee`: lock false (presumably hunters can't lock onto you).
- `Bait`: evade ×1.5, attract ×2.

The room statuses `FREE_PATROL_MOVE_0/1` are bits counting the free patrol-ship actions (`PATROLSHIP_AFTER_BURNER`).

### Odds and damage (`Solver.hx`)

`calcActionOdds`, which applies to both shooting actions:

1. Base: the turret's 30, or the stance's hit for a patrol ship.
2. `IncrActionOdd` adds to the base. `MulActionOdd` and `ToHit(v)` (as +v/100) build a multiplier, as do `EXPERT` (+0.2) and `POLYMATH` (−0.1). Base × multiplier.
3. Repeating the same action as your last one: × `fail_coef` ^ repeats (1.25; `PERSISTENT` makes the coefficient ×1.05).
4. Pariah: ×0.8. Clamp to 0–99.

We already do step 3 for the astro scan, per player.

`getTurretDamage`: the turret's 2–4, doubled if an `INSECTOID_SHELL` is in the room, and doubled again **for each** `GUNNER` in the room. Patrol ship damage is its 3–6 (+1 with `PATROLSHIP_BLASTER_GUN` and with the Cygni rebel base). How a hit's chance meets the target's dodge, and how armor applies, isn't in the snapshot.

### Charges

Turrets hold 4 charges, patrol ships 10 (+6 with `PATROLSHIP_EXTRA_AMMO`); each shot uses one. `TESLA_SUP2X` doubles the turrets' maximum and `TURRET_EXTRA_FIRERATE` doubles their recharge rate, but the base rate isn't in the snapshot. A dead `SPACE_TACTICS` row (after `$EOF`) gave all turrets two extra charges instead.

### Hull, shield and armor

- Hull: 100 (`DAEDALUS.life`). Already in `GameState.ship.hull`.
- `PLASMA_SHIELD` project: the original note says it "starts at 100%, +5% each cycle with no damage, absorbs hunter attacks (1% = 1 point), % shown on the map's rollover". The owner already decided (2026-10-19) that it starts at 100 and absorbs 67% of incoming damage from its own points (`damageShip` in `shared/src/ship.ts`, not called yet). Regeneration isn't decided. The NERON BIOS has an on/off switch for it (`ENABLE_PLASMA_SHIELD`).
- `ARMOUR_CORRIDOR` project: every attack on the Daedalus is reduced by 1.
- D1000 has armor 1. `PLASTENITE_ARMOR` absorbs 1 point of a crew member's combat damage (not ship combat).
- NERON's shield alert (`bouclier:` in `Ebe-Neron/events.json`) and hunter alert (`hunter:`) are the alert-bar lines; the client shows a hunter icon in the alert bar (`ShipHasHunters`).
- Fire also damages the hull (`FIRE_HULL_DMG_PC` 20%, 2–4), which is a separate system.

### Equipment and rooms

- Ours already has the six `LASER_TURRET_*` rooms with a `TURRET_COMMAND` each, and the bays with `PATROL_INTERFACE`s: Bay Alpha 3 (Longane, Jujube, Tamarin), Bay Beta 3 (Socrate, Epicure, Platon), Bay Alpha 2 (Wallis, and the Pasiphae).
- In the original each patrol ship is a **room** (`PATROL_SHIP_A_0`…, capacity 1, status `DETACHED` while out, `INDESTRUCTIBLE`) holding a `PATROL_COMMAND`, plus an `OUTER_SPACE` room. Our 27-room graph has none of them.
- Repairing a broken `PATROL_COMMAND` repairs its `PATROL_INTERFACE` and the other way round (`Utils.repairObject`).
- NERON BIOS settings (`DataExt2/neronAdmin.json`): `ACL_PILOTS` (patrol ships for everyone or pilots only; default "restricted"), `MAGNET` (`MAGNETIC_NET` project), `ENABLE_PLASMA_SHIELD`.

### Modifiers that touch combat

Live rows only, unless marked.

- **Skills** (all already in `shared/src/skills.ts` with no effect): `PILOT` (never fails takeoff or landing, can change stance), `GUNNER` ("Canonnier": `MulActionOdd(TURRET_ATTACK, 2.0)`, and doubles turret damage per `getTurretDamage`; its footnote says "+50%", which disagrees with the effect), `GUNMAN` ("Tireur": +2 free shooting points per day, max 4, `IncrPAPerDay(SHOOT, 2)`; both shooting actions are colour `SHOOT`, so they'd draw on that pool, like our care and computer points), `SPACE_TACTICS` (50% chance to cut each hunter wave by 33%), `EXPERT`, `POLYMATH`, `PERSISTENT` (odds, above), `ENGINEER` (×2 on `REPAIR_PATROL_SHIP`, not on the hull).
- **Projects**: `PATROL_SHIP_LAUNCHER` (takeoff −1 AP), `PATROLSHIP_BLASTER_GUN` (+1 patrol damage; in notes only), `BAY_DOOR_XXL` (takeoff and landing ×1.5), `PATROLSHIP_EXTRA_AMMO` (+6 charges), `TURRET_EXTRA_FIRERATE` (×2 turret recharge), `ARMOUR_CORRIDOR`, `PLASMA_SHIELD`, `MAGNETIC_NET` (patrol ships pulled aboard when the Daedalus travels), `DISMANTLING` (5 metal scraps in the motor room), `NERON_TARGETING_ASSIST` (×1.25 to both shooting actions; restricted to some characters), `BRIC_BROC` (15% per cycle that the Daedalus "doesn't fall apart"; unclear). Dead rows: `PATROLSHIP_AFTER_BURNER` (first 2 patrol actions free), `PATROLSHIP_MORE_FUEL` (patrol autonomy ×2).
- **Research**: `FUNGUS_SCRAMBLER` (each hunter shot has 20% to target another hunter), `TESLA_SUP2X` (turret max charges ×2).
- **Items**: `NCC_LENS` (`ToHit(10)`), `INSECTOID_SHELL` (×2 turret damage in its room; fire if destroyed), `WAVOSCOPE` (×2 on hull and patrol repairs), `METAL_SCRAPS` (hull repair), `MISSILE_SP2SP_230` (dead row: "doubles patrol shots", notes "25% to destroy two hunters"; Cygni's reward is its plans).
- **Rebel base** Cygni: patrol ship damage +1 (built 2026-11-07, `patrolDamageBonus` in `comms.ts`).

### Deaths, triumph, logs

- Deaths (`DataExt/deaths.json`): `HUNTED` (in space while hunters are there), `SPACE_COMBAT` (inside a craft that was destroyed), `OXYGEN_PATROL` (patrol ship autonomy ran out), `PATROL_EXPLOSION_LAND` (crashed landing).
- Triumph: `DAEDALUS_DEFENDER` +1 per hunter shot down; Roland's `HUNTER_NEMESIS`. Trophy `hunter_down`. Fun fact `bestHunterKiller`.
- Logs (`DataEvents/events.json`): `TURRET_HIT`, `TURRET_MISS`, `TURRET_HIT_HUNTER_DOWN`, `PATROL_HIT`, `PATROL_MISS`, `PATROL_HIT_HUNTER_DOWN`, `PATROL_DMG`, `ATTACKED_BY_HUNTER`, `HUNTER_WAVE_INC`, `REPAIRED_HULL`, `REPAIRED_HULL_ENG`, `REPAIR_PATROL_TRY_SUCCESS`, `REPAIR_HULL_TRY_SUCCESS`, `MONOPLACE_LAND`, `EJECT_FORCED`, `SHIP_SPIDER_TRAILING`, plus the hunter-state lines above. French only; we'd write en/fr/es from them.
- Objectives (`DataExt2/objectives.json`, `SHOOT_HUNTER`…`5`) tell new players to go to a turret, or take off from a bay, when the alert bar shows hunters, and that "hunting in flight is more profitable than turrets".

### The client's battle panel (`SpaceBattle.hx`)

Shown only while you're in a `LASER_TURRET` or a `PATROL_SHIP` room. On the left, our turrets and patrol ships (turret: charges; patrol ship: hp and charges; your own framed green). On the right, the hunters, sorted by type, each with its small sprite and hp; hover shows its name and footnote. Clicking a hunter makes it the target (sent to the server), then the Shoot action fires at it. A hit shakes it and flashes it red; a kill fades it out. The plasma shield's percentage shows on the minimap.

### Art

- `Mush/clients/iso` sheet `BmpGfxFx`: `FX_SPC_SMALL_{PATROL,HUNTER,TURRET,TRAX,SPIDER,ASTEROID,DICE}` (36×26), `FX_SPC_{HUNTER,TRAX,SPIDER,ASTEROID,DICE}` (larger), `FX_TRANSPORT_0..3` and `_SMALL_0..3`, `FX_SPC_SHIELD`, `FX_SPC_CHARGE`.
- `Mush/www/img/icons/ui/hunter.png` (alert icon), `www/img/art/site/rooms/{laser_turret,patrol_ship}.jpg`, project cards for the patrol and turret projects.
- License check per the `asset` skill before using any of it.

## What we already have

- `GameState.ship.hull` and `plasmaShield`, public in `PlayerView`, and `damageShip` (67% to the shield).
- The turret rooms and bay interfaces as equipment (blank), all the combat skills and projects as ids with no effect, a "space battle" chat channel, blueprints and metal scraps.
- The per-player repeat bonus (astro scan), modifier hooks with typed point pools (care, computer), and the cycle hook (`newCycle` → `cycleChanged`).
- #184 (incident points) proposes "hunter ship spawn" as an incident, which matches the original's aggro pool.

## Open questions

1. **Scope of the first pass.** Proposal: hunters (the plain HUNTER only) attacking the Daedalus, turrets, hull repair, plasma shield. Patrol ships, other hunter types, the Pasiphae, travel and NERON settings later.
2. **Waves.** When do hunters arrive, and how many? Options: through #184's incident points (each HUNTER costs 10, as `aggro_pool_cost` says), or a separate hunter pool. Does the first wave come at a fixed time (the original's intro says the crew wakes during an attack)? Pre-selection disables all combat (2026-10-13): does that include hunters?
3. **Hunter attacks.** How often (once per cycle?), what they target (Daedalus only until patrol ships exist), and how hit meets dodge (80 hit against the Daedalus's 200 dodge needs a formula). Damage 2–4 to the ship through `damageShip`?
4. **Hit chance for players.** 30% turret, ×1.25 per consecutive repeat, as for the scan? Does the target's dodge matter? Tracked per player, and does it reset on a hit?
5. **Turret charges.** 4 per turret: how fast do they come back (per cycle? all at once?), and are they shared by whoever sits there?
6. **Is targeting a choice?** The original let you pick a hunter. With only plain hunters it makes no difference; with several types it does.
7. **Visibility.** Proposal: the hunter count and each hunter's hp are public (the alert bar shows hunters to everyone); shots are public in the turret's room log; NERON's alerts go to everyone. Does a turret shot need an iTrackie or is it seen ship-wide?
8. **Hull repair.** 1 AP, 25%, uses a metal scrap: how much hull does it restore, is the scrap used up on a fail, and where can you do it?
9. **Shield regeneration.** The original note says +5 per cycle with no damage. Adopt it?
10. **What happens at hull 0?** The game ends (and how that counts, since win conditions aren't decided), or everyone dies?
11. **Who can shoot.** Living, not dirty, Mush included? A Mush deliberately missing or not showing up is part of the game.
12. **Skills now or hooks only.** `GUNNER`, `GUNMAN`'s shooting points, `SPACE_TACTICS`, `EXPERT`/`POLYMATH`/`PERSISTENT`: build them, or only add the modifier hooks (as with Radio Expert)?
13. **Disagreements in the data to settle:** `GUNNER` is ×2 in its effect but "+50%" in its text; `MAX_PATROL_HP` 14 against the table's 10; the takeoff roll reads inverted; `NERON_TARGETING_ASSIST` is 25% live and 15% in a dead row.
14. **Patrol ships (later pass).** Are they rooms (as in the original) or a location outside the room graph? Being in one hides you from the ship and blocks most actions. Stances, ejection, life capsules, and the patrol-ship deaths come with them.

## Planned implementation (draft, pending the open questions)

Phase 1, assuming the proposed scope in question 1:

- `shared/src/hunters.ts`: the hunter type table copied from `ships.json` into a typed table (as `planets.ts` does), plus pure functions: `spawnHunters(state, n)`, `huntersAttack(state)` (one roll per hunter, damage through `damageShip`), and `shoot(state, actor, hunterId)`. Numbers in `config.hunters` and `config.turrets`, pinned in tests.
- State: `GameState.hunters: { id, type, hp }[]` (public), turret charges per turret room, and the per-player repeat bonus beside the scan's, each with a default in its normalizer (`shared/src/normalizeState.ts`).
- Cycle: in `newCycle`, after oxygen: spawn (through #184's spender, or its own rule), hunters attack, turrets recharge, shield regenerates if decided. Logs through `logPublic`.
- Actions in `shared/src/actions/`: `turret_attack.ts` (at `TURRET_COMMAND`, target a hunter, uses a charge) and `repair_hull.ts` (holding a metal scrap). Odds go through modifier hooks so `GUNNER`, `NCC_LENS`, `EXPERT` and the rest can attach.
- `viewFor`: `PlayerView.hunters` (type and hp of each), turret charges, both public if question 7 says so. Run `leak-check` anyway, since the pool or schedule (if any) is server-only.
- Web: the alert-bar hunter icon; in a turret room, a battle panel (DOM, so it works with either renderer): hunters on one side, turrets on the other, tap a hunter to target it, the Shoot button from `view.actions`. Works at 360px (the panel likely goes in the Inspect tab or a sheet over the room on phones).
- Tests in `shared/tests/hunters.test.ts`: pinned config numbers, spawning, attacks hitting the shield then the hull for a seed, a kill removing the hunter, charges running out and recharging, the repeat bonus, illegal shots (no charge, not in a turret, dead target) leave the state unchanged, and a headless run where an ignored wave wears the hull down.
- Record it in `docs/rules/implemented-rules.md`, `docs/rules/rules-design.md` ("Decisions received"), `docs/code-map/shared.md`, and `docs/process/ai-workflow.md` (append).

Later phases, each its own plan when it comes up: patrol ships (takeoff, attack, stances, land, eject, repair, patrol-ship deaths), the other hunter types (Arack blocking travel, asteroids on a countdown, D1000 attacking three times, Trax), NERON's pilot lock, the combat projects and research, and the triumph for kills.
