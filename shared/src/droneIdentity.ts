// A support drone's identity (name and serial), kept apart from its behaviour in drones.ts so that code which only
// makes a drone (projectEffects.ts, for EXTRA_DRONE) needn't import drones.ts, whose imports (fire, doors, patrol, ...)
// would close an import cycle and leave modules half-initialized. Imports nothing but the RNG and types.

import { rollInt, rollShuffle } from "./rng.ts";
import type { DroneState, GameState } from "./types.ts";

/**
 * The names a drone is given at random: eMush's nickname list, credited in NOTICE, without "Dalek" (a BBC trademark;
 * owner, 2026-11-11). A drone keeps its name as a string, so changing the list only changes the names new drones roll.
 */
export const DRONE_NAMES: readonly string[] = [
  "Betty", "Charlotte", "Dave", "Doc", "Doudou", "Douglams", "Einstein", "Fido", "Fito", "Groo", "Isaac", "Loulou",
  "Médor", "Nabuk", "Papitou", "Poutou", "Rex", "Robbie", "Robert", "Selry", "Steve", "Terminus", "Troll", "Vortex", "Weathley",
];

/** The highest serial number; a drone's is 1 to this. */
export const DRONE_MAX_SERIAL = 99;

/**
 * A new drone's state, from the NPCs' own stream (`state.npcs`, npcs.ts): the next name in the queue, which is the
 * name list shuffled (so names don't repeat until all are used, then a fresh shuffle), a random serial, no upgrades,
 * no failures.
 */
export function newDrone(state: GameState): DroneState {
  const npcs = state.npcs;
  if (npcs.droneNames.length === 0) npcs.droneNames = rollShuffle(npcs, DRONE_NAMES);
  const name = npcs.droneNames.shift()!;
  const serial = rollInt(npcs, DRONE_MAX_SERIAL) + 1;
  return { name, serial, upgrades: [], failures: { repair: 0, extinguish: 0, shoot: 0 } };
}
