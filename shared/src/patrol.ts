// Patrol ships and the Pasiphae (docs/patrol-plan.md, phase 2; owner, 2026-10-24, #208 and #147). Eight small ships
// dock in the three bays. Each is a room of its own with no doors (ships are rooms, answer 1), holding only its
// command: a pilot takes off from the ship's interface in the bay and lands from the command. Taking off and landing
// are secret, seen in the bay (answer 4). Only Pilots fly for now (answer 3); a manoeuvre by anyone else would be rough
// 80% of the time, which is built (`manoeuvre` in actions/takeoff.ts) for when the BIOS lock and spaceship keys come.

// Data and lookups only, so config.ts can import it; the manoeuvre itself is in actions/takeoff.ts.

import { hasSkill } from "./skills.ts";
import type { Equipment, GameConfig, GameState, PlayerState, RoomId } from "./types.ts";

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

/** Every ship docked, at full armor. */
export const newPatrolShips = (config: GameConfig): GameState["patrolShips"] =>
  Object.fromEntries(PATROL_SHIPS.map((s) => [s.id, { armor: config.patrol.armor[s.kind], out: false }]));

/** Who may fly: Pilots only for now (answer 3; the BIOS piloting lock and spaceship keys come later). */
export const canFly = (player: Readonly<PlayerState>): boolean => hasSkill(player, "pilot");

/** Docked ships whose interface is in the player's room. */
export function dockedHere(state: Readonly<GameState>, player: Readonly<PlayerState>): PatrolShip[] {
  return PATROL_SHIPS.filter((s) => s.bay === player.room && !state.patrolShips[s.id]?.out);
}

/** The ship whose room the player is in, if any. */
export const shipAboard = (player: Readonly<PlayerState>): PatrolShip | undefined => patrolShip(player.room);
