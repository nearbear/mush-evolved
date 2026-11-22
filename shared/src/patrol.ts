// Patrol ships and the Pasiphae (docs/plans/archive/patrol.md, phase 2; owner, 2026-10-24, #208 and #147). Eight small ships
// dock in the three bays. Each is a room of its own with no doors (ships are rooms, answer 1), holding only its
// command: a pilot takes off from the ship's interface in the bay and lands from the command. Taking off and landing
// are secret, seen in the bay (answer 4). Only Pilots fly for now (answer 3); a manoeuvre by anyone else would be rough
// 80% of the time, which is built (`manoeuvre` in actions/takeoff.ts) for when the BIOS lock and spaceship keys come.

// Data and lookups only, so config.ts can import it; the manoeuvre itself is in actions/takeoff.ts.

import { projectDone } from "./projects.ts";
import { hasSkill } from "./skills.ts";
import type { Equipment, GameConfig, GameState, PlayerId, PlayerState, RoomId } from "./types.ts";

export type PatrolKind = "patrol" | "pasiphae";

/** A ship's fixed data. Its id is its room (`RoomId`), as in the original's `rooms` sheet (Data.ods). */
export interface PatrolShip {
  id: RoomId;
  bay: RoomId;
  kind: PatrolKind;
}

/** The original's eight, by room id (Mush/derived/data/Data/rooms.json): Longane, Jujube, Tamarin; Socrate, Epicure, Platon; Wallis; the Pasiphae. */
export const PATROL_SHIPS: readonly PatrolShip[] = [
  { id: "PATROL_SHIP_A_0", bay: "SPACESHIP_BAY_A", kind: "patrol" },
  { id: "PATROL_SHIP_A_1", bay: "SPACESHIP_BAY_A", kind: "patrol" },
  { id: "PATROL_SHIP_A_2", bay: "SPACESHIP_BAY_A", kind: "patrol" },
  { id: "PATROL_SHIP_B_0", bay: "SPACESHIP_BAY_B", kind: "patrol" },
  { id: "PATROL_SHIP_B_1", bay: "SPACESHIP_BAY_B", kind: "patrol" },
  { id: "PATROL_SHIP_B_2", bay: "SPACESHIP_BAY_B", kind: "patrol" },
  { id: "PATROL_SHIP_AA_0", bay: "SPACESHIP_BAY_AA", kind: "patrol" },
  { id: "PATROL_SHIP_AA_1", bay: "SPACESHIP_BAY_AA", kind: "pasiphae" },
];

export const PATROL_INTERFACE = "PATROL_INTERFACE";

/**
 * The Icarus while away on an expedition (docs/plans/archive/expedition.md, phase 2; owner, 2026-11-07): a room with no doors
 * and no equipment, like a patrol ship's. A permanent room id. Here so config.ts can import it.
 */
export const ICARUS_CRAFT = "ICARUS_CRAFT";

/** A craft's room: a patrol ship's or the Icarus's, where the ship's rooms and equipment are out of reach. */
export const inCraft = (room: RoomId): boolean => room === ICARUS_CRAFT || patrolShip(room) !== undefined;

/**
 * Where a member lost on a planet is (docs/plans/archive/expedition.md, phase 3, slice B; owner, 2026-11-08, #357): a place of
 * their own, off the map, with no doors or equipment, so their speech reaches nobody. Not in `config.rooms`.
 */
export const lostPlace = (player: PlayerId): RoomId => `${LOST_PREFIX}${player}`;
export const isLostPlace = (room: RoomId): boolean => room.startsWith(LOST_PREFIX);
const LOST_PREFIX = "LOST:";

/** Off the Daedalus: in a craft, or lost on a planet. Nothing aboard the ship can be built, installed or set on fire there. */
export const offShip = (room: RoomId): boolean => inCraft(room) || isLostPlace(room);
/** The equipment type in each ship's room, as in the original (`objects` in its `rooms` sheet). */
export const PATROL_COMMANDS: Record<PatrolKind, string> = { patrol: "PATROL_COMMAND", pasiphae: "PASIPHAE_COMMAND" };

/** The ship's interface in its bay, as the map names it (`ship-rooms.json`). */
export const interfaceId = (ship: PatrolShip): string => `${ship.bay}:${ship.id}`;
export const commandId = (ship: PatrolShip): string => `${ship.id}:${PATROL_COMMANDS[ship.kind]}`;

export const patrolShip = (id: string): PatrolShip | undefined => PATROL_SHIPS.find((s) => s.id === id);

/** The ships' rooms, for `config.rooms` (no doors) and `config.equipment` (the command), beside the map's 27. */
export const patrolRooms = (): Record<RoomId, RoomId[]> => Object.fromEntries(PATROL_SHIPS.map((s) => [s.id, []]));
export const patrolEquipment = (): Record<RoomId, Equipment[]> =>
  Object.fromEntries(PATROL_SHIPS.map((s) => [s.id, [{ id: commandId(s), type: PATROL_COMMANDS[s.kind] }]]));

/** Shots a ship holds when full: none for the Pasiphae, which can't shoot. */
export const maxCharges = (charges: number, ship: PatrolShip): number => (ship.kind === "pasiphae" ? 0 : charges);

/** Shots a ship holds when full in `state`: +extraCharges once Teslatron reservoir (PATROLSHIP_EXTRA_AMMO) is complete. */
export function patrolMaxCharges(state: Readonly<Pick<GameState, "config" | "projects">>, ship: PatrolShip): number {
  if (ship.kind === "pasiphae") return 0;
  const extra = projectDone(state, "PATROLSHIP_EXTRA_AMMO") ? state.config.project.patrolShipExtraAmmo.extraCharges : 0;
  return state.config.patrol.charges + extra;
}

/** Extra damage on every patrol ship hit once Blaster gun (PATROLSHIP_BLASTER_GUN) is complete (owner, 2026-11-14). */
export function patrolBlasterBonus(state: Readonly<Pick<GameState, "config" | "projects">>): number {
  return projectDone(state, "PATROLSHIP_BLASTER_GUN") ? state.config.project.patrolShipBlasterGun.extraDamage : 0;
}

/** Every ship docked, at full armor and charges. */
export const newPatrolShips = (config: GameConfig): GameState["patrolShips"] =>
  Object.fromEntries(PATROL_SHIPS.map((s) => [s.id, { armor: config.patrol.armor[s.kind], charges: maxCharges(config.patrol.charges, s), out: false, destroyed: false, onPlanet: null }]));

/** Ships out, not destroyed and not on a planet: the ones hunters can aim at. */
export const shipsInFlight = (state: Readonly<GameState>): PatrolShip[] =>
  PATROL_SHIPS.filter((s) => {
    const ship = state.patrolShips[s.id]!;
    return ship.out && !ship.destroyed && ship.onPlanet === null;
  });

/**
 * Whether `ship` may collect scrap at all: the Pasiphae always, a patrol ship only once the Pasiphae is destroyed (owner,
 * 2026-11-11). Its pilot sees the debris count only then. The Pasiphae's destruction is public (announced, or shown in its bay),
 * except that a pilot in flight can infer a loss on a planet with death announcements off (see the leak-check, 2026-11-11).
 */
export const canScavenge = (state: Readonly<GameState>, ship: Readonly<PatrolShip>): boolean =>
  ship.kind === "pasiphae" || PATROL_SHIPS.every((s) => s.kind !== "pasiphae" || state.patrolShips[s.id]!.destroyed);

/** Whether this ship sits on the orbited planet (owner, 2026-11-09, #359): nothing flies it until it docks. */
export const onPlanet = (state: Readonly<GameState>, ship: Readonly<PatrolShip>): boolean => state.patrolShips[ship.id]!.onPlanet !== null;

/** At a cycle change: each docked ship regains charges up to full (owner, 2026-10-24: only while docked). */
export function rechargePatrolShips(state: GameState): void {
  for (const ship of PATROL_SHIPS) {
    const shipState = state.patrolShips[ship.id]!;
    if (!shipState.out && !shipState.destroyed) shipState.charges = Math.min(patrolMaxCharges(state, ship), shipState.charges + state.config.patrol.rechargePerCycle);
  }
}

/** Who may fly: anyone, except humans with Gastroenteritis or Slight Nausea. */
// Gastroenteris / Slight Nausea grounds a human (owner, 2026-11-14, 2026-11-15); a Mush's diseases have no effect (diseases.ts).
export const canFly = (player: Readonly<PlayerState>): boolean =>
  player.role === "mush" || !GROUNDING_DISEASES.some((id) => player.modifiers.includes(id));

/**
 * Who may take off in a patrol ship, the Pasiphae, or the Icarus (owner, 2026-11-21): anyone who can fly, unless
 * NERON's crew lock is set to piloting, in which case only Pilots (or `freeHacking`) may launch.
 */
export const canTakeoff = (state: Readonly<GameState>, player: Readonly<PlayerState>): boolean =>
  canFly(player) && (state.bios.crew_lock !== "piloting" || hasSkill(player, "pilot") || player.cheats.includes("freeHacking"));

/** Diseases that keep a human from flying (owner: Gastroenteritis 2026-11-14, Slight Nausea 2026-11-15). */
const GROUNDING_DISEASES: readonly string[] = ["gastroenteritis_disease", "slight_nausea_disease"];

/** Docked ships whose interface is in the player's room. */
export function dockedHere(state: Readonly<GameState>, player: Readonly<PlayerState>): PatrolShip[] {
  return PATROL_SHIPS.filter((s) => s.bay === player.room && !state.patrolShips[s.id]?.out && !state.patrolShips[s.id]?.destroyed);
}

/** The ship whose room the player is in, if any. */
export const shipAboard = (player: Readonly<PlayerState>): PatrolShip | undefined => patrolShip(player.room);
