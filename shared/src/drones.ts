// Support drones (#411, phase 1 of #410; owner, 2026-11-11, from eMushpedia "Drone de soutien"). A drone is an NPC
// item (npcs.ts) with its own state in `ItemState.drone`. Each cycle change, a working drone aboard the Daedalus
// repairs the first broken thing in its room it can repair, or else moves to a neighbouring room. A carried drone
// acts in its carrier's room, and with nothing to repair it leaves the inventory for a neighbouring room too (owner,
// 2026-11-11, as eMush). Upgrades (#412, actions/upgrade_drone.ts): a Firefighter drone puts out its room's fire before
// anything else and fire never breaks it; a Turbo drone has `config.drones.turboChance` of a second turn (a full one,
// which may move it again), never a third (owner, 2026-11-12); a Sensor drone (#413) steps along `shortestPath` toward
// the nearest trouble (fire if Firefighter, else broken repairable equipment or floor item; hunters if Pilot in #415)
// with ties broken by door order, falling back to a random move. It never repairs a hidden item (no new way to learn
// of one) nor anything someone carries (inventories are private). A broken drone does nothing. Its lines are public in
// the room; NERON says nothing.

import { isBreakable } from "./breakage.ts";
import { isOnFire } from "./fire.ts";
import { ITEM_TYPES, itemsIn } from "./items.ts";
import { logPublic } from "./log.ts";
import type { Npc } from "./npcs.ts";
import { shortestPath } from "./paths.ts";
import { offShip } from "./patrol.ts";
import { rollFloat, rollInt, rollShuffle } from "./rng.ts";
import type { DroneState, Equipment, GameState, ItemState, LogParams, RoomId } from "./types.ts";

/**
 * The names a drone is given at random: eMush's nickname list, credited in NOTICE, without "Dalek" (a BBC trademark;
 * owner, 2026-11-11). A drone keeps its name as a string, so changing the list only changes the names new drones roll.
 */
export const DRONE_NAMES: readonly string[] = [
  "Betty", "Charlotte", "Dave", "Doc", "Doudou", "Douglams", "Einstein", "Fido", "Fito", "Groo", "Isaac", "Loulou",
  "Médor", "Nabuk", "Papitou", "Poutou", "Rex", "Robbie", "Robert", "Selry", "Steve", "Terminus", "Troll", "Vortex", "Weathley",
];

/**
 * The upgrades a Robotics Expert can fit (#412, #413): Firefighter, Turbo, and Sensor. Pilot (#415) joins the list
 * when its effects are built, so nobody pays for one that does nothing (owner, 2026-11-12). Permanent ids.
 */
export const DRONE_UPGRADES = ["firefighter", "turbo", "sensor"] as const;
export type DroneUpgrade = (typeof DRONE_UPGRADES)[number];

export const isDroneUpgrade = (x: unknown): x is DroneUpgrade => typeof x === "string" && (DRONE_UPGRADES as readonly string[]).includes(x);

export const hasUpgrade = (item: Readonly<ItemState>, upgrade: DroneUpgrade): boolean => item.drone?.upgrades.includes(upgrade) ?? false;

/** Fire never breaks a Firefighter drone (fire.ts). */
export const isFireproof = (item: Readonly<ItemState>): boolean => hasUpgrade(item, "firefighter");

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

/** A drone in a log line: `drone` (its name) and `serial`, which the client puts together. */
export const droneParams = (drone: Readonly<DroneState>): LogParams => ({ drone: drone.name, serial: drone.serial });

/** A drone task's chance: the base x `failureMultiplier` per failure in a row, capped at `maxChance`. */
export function droneChance(state: Readonly<GameState>, base: number, failures: number): number {
  const { failureMultiplier, maxChance } = state.config.drones;
  return Math.min(maxChance, base * failureMultiplier ** failures);
}

type RepairTarget = { equipment: Equipment; chance: number } | { item: ItemState; chance: number };

/**
 * What a drone in `room` would repair: the room's first broken repairable equipment, in the room's order, else the
 * first broken repairable item on its floor, in creation order, never one someone hid (owner, 2026-11-11).
 */
export function droneRepairTarget(state: Readonly<GameState>, room: RoomId): RepairTarget | undefined {
  const equipment = (state.equipment[room] ?? []).find((e) => e.broken && isBreakable(state, e.type));
  if (equipment) return { equipment, chance: state.config.repair.chance[equipment.type]! };
  const item = itemsIn(state, { kind: "room", id: room }).find((i) => i.broken && i.hiddenBy === undefined && ITEM_TYPES[i.type]?.repairChance !== undefined);
  return item && { item, chance: ITEM_TYPES[item.type]!.repairChance! };
}

/** One repair try, if there is something to repair: one seeded roll, Repair's effect on a success. Returns whether it tried. */
function repair(state: GameState, drone: DroneState, room: RoomId): boolean {
  const target = droneRepairTarget(state, room);
  if (!target) return false;
  const success = rollFloat(state) < droneChance(state, target.chance, drone.failures.repair);
  // Owner, 2026-11-11: a success resets the count, as for the crew (eMush keeps it).
  drone.failures.repair = success ? 0 : drone.failures.repair + 1;
  const what: LogParams = "equipment" in target ? { equipment: target.equipment.type } : { item: target.item.type };
  const key = "equipment" in target ? (success ? "droneRepaired" : "droneRepairFailed") : success ? "droneRepairedItem" : "droneRepairFailedItem";
  // A repaired turret gets its charges back on its own (hunters.ts reads `broken`), as with Repair.
  if (success) delete ("equipment" in target ? target.equipment : target.item).broken;
  logPublic(state, room, key, { ...droneParams(drone), ...what });
  return true;
}

/**
 * A Firefighter drone's try at its room's fire, if there is one: one seeded roll at Extinguish's base chance raised by
 * its own failure count, which a success resets (owner, 2026-11-12, as for repair). Returns whether it tried.
 */
function extinguish(state: GameState, item: ItemState, drone: DroneState, room: RoomId): boolean {
  if (!hasUpgrade(item, "firefighter") || !isOnFire(state, room)) return false;
  const success = rollFloat(state) < droneChance(state, state.config.extinguish.chance, drone.failures.extinguish);
  drone.failures.extinguish = success ? 0 : drone.failures.extinguish + 1;
  if (success) state.fires = state.fires.filter((r) => r !== room);
  logPublic(state, room, success ? "droneExtinguished" : "droneExtinguishFailed", droneParams(drone));
  return true;
}

/**
 * The next room along `shortestPath` toward the highest-priority trouble a Sensor drone (#413) can handle:
 * a burning room (only with Firefighter), then a room with broken repairable equipment or floor item (hunters attacking
 * is gated on Pilot, #415). Ties go by door order in `config.rooms`; undefined if no target is reachable.
 */
function sensorStep(state: Readonly<GameState>, item: Readonly<ItemState>, room: RoomId): RoomId | undefined {
  const targets: ((r: RoomId) => boolean)[] = [];
  if (hasUpgrade(item, "firefighter")) targets.push((r) => isOnFire(state, r));
  targets.push((r) => droneRepairTarget(state, r) !== undefined);
  for (const match of targets) {
    const step = shortestPath(state.config.rooms, room, (r) => r !== room && !offShip(r) && match(r))?.[0];
    if (step) return step;
  }
  return undefined;
}

/** Moves a drone in `room` (on its floor, or carried there) to a neighbouring room's floor aboard the Daedalus (Sensor pathfinding first if upgraded, else random), with public lines in both. Returns where it ends up. */
function wander(state: GameState, item: ItemState, drone: DroneState, room: RoomId): RoomId {
  const neighbours = (state.config.rooms[room] ?? []).filter((r) => !offShip(r));
  if (neighbours.length === 0) return room;
  const to = (hasUpgrade(item, "sensor") && sensorStep(state, item, room)) || neighbours[rollInt(state, neighbours.length)]!;
  item.at = { kind: "room", id: to };
  logPublic(state, room, "droneLeft", { ...droneParams(drone), room: to });
  logPublic(state, to, "droneEntered", { ...droneParams(drone), room });
  return to;
}

/** One turn: put out a fire (Firefighter), else repair, else wander. Returns the room it ends the turn in. */
function turn(state: GameState, item: ItemState, drone: DroneState, room: RoomId): RoomId {
  if (extinguish(state, item, drone, room) || repair(state, drone, room)) return room;
  return wander(state, item, drone, room);
}

/** The support drone's behaviour (npcs.ts). */
export const supportDrone: Npc = {
  create: (state, item) => {
    item.drone = newDrone(state);
  },
  act: (state, item, room) => {
    if (item.broken || offShip(room)) return;
    // A drone made before drones had state (a game started before #411 landed) gets it on its first turn.
    const drone = (item.drone ??= newDrone(state));
    const now = turn(state, item, drone, room);
    // Turbo (owner, 2026-11-12): one roll for a full second turn, in the room the first left it in; never a third.
    if (hasUpgrade(item, "turbo") && state.phase === "playing" && rollFloat(state) < state.config.drones.turboChance) turn(state, item, drone, now);
  },
};
