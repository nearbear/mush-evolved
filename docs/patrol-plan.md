# Patrol ships and the Pasiphae (plan)

2026-10-24. The owner's answers are at the end and override the eMush behaviour described under "Sources". The points under "Still open" are not decided: ask the owner (the `rule` skill) before building them. Issues: #208 (patrol ships were its deferred later pass), #147 (Pasiphae). Builds on the first pass of hunters (`shared/src/hunters.ts`, `docs/implemented-rules.md`, "Hunters and space combat").

## Sources

The numbers come from eMush's source and eMushpedia (*Pilotage*, *Baie*, *Collecte de débris*, *Capsule spatiale*). The archived original's numbers are in `docs/space-combat-plan.md`; they agree except where noted.

### The ships

Eight, each with its own interior room in eMush (`PATROL_SHIP_*`, no doors) and docked in a bay. Our `ship-rooms.json` already has their `PATROL_INTERFACE`s, and `ship-art.json` has the patrol-ship interior tiles.

| Bay | Ships |
| --- | --- |
| Alpha (`SPACESHIP_BAY_A`) | Longane, Jujube, Tamarin |
| Beta (`SPACESHIP_BAY_B`) | Socrate, Epicure, Platon |
| Alpha 2 (`SPACESHIP_BAY_AA`) | Wallis (`AA_0`), Pasiphae (`AA_1`) |

| | Patrol ship | Pasiphae |
| --- | --- | --- |
| Armor (hp) | 10 | 12 |
| Charges | 10, +1 per cycle **only while docked** | none, can't shoot |
| Shot | 1 AP, 40%, 3–6 damage | — |
| Collect scrap, per try | 0 (75%) or 1 (25%) | 1, 2 or 3 (equal) |

### Actions (eMush numbers)

- **Take off** (at a docked ship's interface in a bay): 2 AP. Always works. 20% "critical" = clean; otherwise rough: hull −2..4 (straight to the hull, not through the shield), ship armor −1, pilot −0..2 hp (private). The Pilot skill is always clean. Moves the pilot (and only the pilot) into the ship's room. No log line on a clean takeoff; a rough one logs the armor damage publicly in the ship's room. (Ours: secret, see answer 4.)
- **Land**: 2 AP, the same clean/rough roll (damage log in the bay). Everyone alive aboard goes to the docking bay; items in the ship's room are unloaded into the bay (public line `PATROL_DISCHARGE` in the bay; ours: the landing is secret, see answer 4). Hunters aiming at the ship switch back to the Daedalus.
- **Shoot** (patrol ships only, in flight): 1 AP, 1 charge, 40% ×1.25 per miss in a row (its own count, not the turrets'; answer 8), 3–6 damage. Pilot skill ×2 odds. Hit hidden, miss private (eMush); our turrets log hit/miss privately and a kill publicly.
- **Collect scrap** (in flight, while debris floats around the ship): 2 AP. Draws the table above, moves that many random debris into the ship's room. While hunters remain: ship armor −2..4 and pilot hp 0 (50%) or −2/3/4. Not offered with no debris. Fail is public, success hidden.
- **Renovate** (repair a docked, damaged ship, at its interface): 2 AP, 12%, uses one metal scrap from hand or room **whether or not it works**; success sets armor to max. Engineer ×2 and the Wavoscope ×2 hook in later.
- Later, not in this plan: Mush auto-eject (needs a spacesuit), landing on a planet from a patrol ship (exploration), drones, the BIOS piloting lock and spaceship keys.

### Hunters and space

- **Targeting**: a hunter picking a target tries, in order, a patrol ship in flight (15%), then a player in flight (5%), else the Daedalus. Hitting a patrol ship takes 2–4 armor; a player, 2–4 hp. Hitting a ship it doesn't destroy keeps it as the target (unlike the Daedalus, where a hit drops the aim).
- **Destroyed** (armor 0): permanent. Everyone aboard is ejected into space and dies without an operational spacesuit (we have none, so they die). The room's contents float off as debris.
- **Debris**: a destroyed hunter drops 1 (⅔) or 2 (⅓) pieces into space, drawn from metal scraps 2 : space capsule 1 : plastic scraps 1. The space capsule is an item that, opened for 1 AP, becomes a random item (metal scraps, plastic scraps, oxygen capsule or fuel capsule).
- **Travel** (and leaving orbit): every ship in flight is destroyed and its pilot dies (unless the Magnetic net project, not built), and all debris is lost. This is a real Mush lever: a Mush Commander can jump while a human is out.
- **Hull 0**: everyone dies wherever they are (already true).

## Proposed design

### Ships are rooms (decided)

Each ship gets a real `RoomId` (`PATROL_SHIP_A_0`, ...) with no doors, added to `config.rooms` and `config.equipment` alongside the 27 ship rooms but outside the map. Being "in Longane" is then an ordinary room: `logPublic` in the ship's room, `peopleHere`, items in the room (collected scrap, things you drop), ACTOPI and `viewFor`'s room filtering all work unchanged, and a pilot naturally stops seeing the bay. This is eMush's model.

Alternative: a `PlayerState.flying` field with the player still "in" the bay. Cheaper for the map, but every room-based check (bay logs, bay items, people in the bay, cameras) would need an exception, which is where leaks come from. Rejected.

Cost of rooms: anything that walks every room has to tolerate door-less rooms off the map (the minimap and ship map, ACTOPI room counts, `unidentified`, room pickers in cheats and tools, `ship-layout` tests); the client needs an interior view for a ship room.

### State (plain JSON; bump `STATE_VERSION`)

- `GameState.patrolShips: Record<ShipId, { armor: number; charges: number; out: boolean; destroyed: boolean }>` (or a missing entry = docked, full). Static data (name, room, interface id, bay, kind `patrol`/`pasiphae`) in a `PATROL_SHIPS` table in a new `shared/src/patrol.ts`, numbers in `config.patrol`.
- `GameState.space: string[]`: debris item types floating around the ship. Server-only; what flyers learn about it is still open.
- `HunterState.targeted: boolean` becomes `target: null | { kind: "ship" } | { kind: "patrol"; id } | { kind: "player"; id }`. A refactor commit on its own first, with no behaviour change.

### Actions (one file each in `shared/src/actions/`)

`takeoff.ts`, `land.ts`, `patrol_attack.ts` (its own per-player miss streak, `patrolFailures`, separate from `turretFailures`), `collect_scrap.ts`, `renovate.ts`, and an Open action for the space capsule. Odds and amounts in config and through modifier hooks (Pilot, Gunner?, Engineer, the launcher and XXL bay door projects, blaster gun, extra ammo, Cygni), with Pilot's effects built since the skill exists.

In flight, every action that needs equipment is already unavailable (the ship's room only has its command). Item actions (eat, drop, ...) keep working, as in eMush. `move` has no doors to offer.

### Cycle (`huntersCycle`)

After the hunters act: docked patrol ships recharge 1 charge. Hunter targeting gains the patrol and player branches. A destroyed ship kills its crew through `killPlayer` and empties the room into `state.space`. `damageHunter` drops debris on a kill. `huntersFollow`'s callers (`travel`, `leave_orbit`) also destroy ships in flight (killing their crew) and clear `state.space`.

### Views (run `leak-check`)

- In the bay: each interface shows docked or out (and armor/charges on examine, eMush's way).
- In a ship: the turret panel becomes the battle panel (hunters with hp, this ship's charges and armor; other ships in flight with armor/charges, as in the original's SpaceBattle panel), plus Land, Shoot and Collect on the ship's command.
- The turret rooms' battle panel lists ships in flight too.
- Debris: offered as Collect only (eMush), or a count to those in flight (still open).

### Client

The ship-room interior from the existing patrol-ship art (check with the `asset` skill), or a plain panel if that's too much for now. The map highlights the bay the ship left from or shows "in flight"; phone layout through `actionsOn`. Make sure `WanderBot` doesn't strand itself (it could take off and never land).

### Phases (each a small commit)

1. `hunters.target` refactor (no behaviour change).
2. Ship rooms and state; take off and land (Pilots only, secret, the rough roll behind a hook); bay and interior views.
3. Shooting from a patrol ship, charges, the shared battle panel.
4. Hunters target ships and players in flight; destruction and death in space; travel destroys ships in flight.
5. Debris: hunter drops, Collect scrap (patrol and Pasiphae), unloading on landing, travel clears it; the space capsule item and its Open action.
6. Renovate.

Later: BIOS piloting lock + spaceship keys, Mush auto-eject and spacesuits, Magnetic net and the other patrol projects, Gunman shooting points, patrol-ship planet landing, triumph for kills.

## Owner's answers (2026-10-24)

1. Ships are rooms.
2. The numbers in "Sources" above, as listed: rough manoeuvres hit the hull directly, bypassing the shield; armor 10 (Pasiphae 12); 10 charges, regenerating 1 a cycle only while docked; and the rest as given.
3. Only Pilots may fly for now (the BIOS lock and spaceship keys come later). So the rough-manoeuvre roll never fires yet; it is built behind a hook for when non-pilots can fly.
4. Takeoff and landing are **secret** actions (`logSecret`): takeoff is logged in the bay before the pilot leaves, landing in the bay after they arrive, so anyone in the bay (or a camera) sees it and nobody else does.
5. Travel with ships out destroys them and kills the pilots (eMush).
6. The space capsule is in: a new item, opened for 1 AP, becoming metal scraps, plastic scraps, an oxygen capsule or a fuel capsule (25% each, eMush). The oxygen capsule item already exists.
7. The Pasiphae carries one person.
8. Patrol-ship shots keep their own miss count (eMush): misses at a turret don't carry into a patrol-ship shot, or the other way round.
9. The Pasiphae is in the design (all six phases).

## Still open

Not asked yet; ask the owner before building the phase that needs them:

- Log lines for hunters hitting a ship or a pilot in flight, and for a ship destroyed with its pilot (phase 4). Hunters hitting the Daedalus have none.
- Visibility of patrol-ship shots and kills (phase 3). The turrets' pattern (hit/miss private, kill public in the room) is the obvious default, but the room is the ship, so a kill would be seen only by its pilot.
- Whether anyone in flight learns how much debris is out there, beyond Collect being offered (phase 5), and the visibility of Collect and Renovate lines.
- What the rest of the crew sees of a ship in flight: its interface in the bay shown as out, the pilot's room name under ACTOPI, and how the map shows someone in a ship (phase 2).
