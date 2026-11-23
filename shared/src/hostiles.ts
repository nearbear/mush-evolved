// Hostile NPCs (owner, 2026-11-22): the registry of kinds and what the rest of the rules do with them. The base class
// and its actions are in hostiles/; each kind is a file there extending `HostileNpc`, plus an entry in `HOSTILE_KINDS`
// and its numbers in `config.hostiles.kinds`. They are kept apart from `players`, so victory, crew-size scaling, morale
// and the views' crew lists never count them. For now only tests and the Superkube make one (no natural spawn).

import { logPublic } from "./log.ts";
import { HOSTILE_ID_PREFIX, type HostileNpc, type HostileState } from "./hostiles/hostile.ts";
import { INTRUDER, Intruder } from "./hostiles/intruder.ts";
import type { GameState, PlayerState, RoomId } from "./types.ts";

export { HOSTILE_ID_PREFIX, HostileNpc, isHostileId, type HostileState } from "./hostiles/hostile.ts";
export { HostileAction, type HostileActionData, type HostileOption } from "./hostiles/actions/action.ts";
export { HOSTILE_MOVE } from "./hostiles/actions/move.ts";
export { HOSTILE_PUNCH } from "./hostiles/actions/punch.ts";
export { INTRUDER } from "./hostiles/intruder.ts";

/** Each hostile kind's class, by `kind`. A kind is permanent once stored: rename what players see in the locales, not the id. */
export const HOSTILE_KINDS: Readonly<Record<string, HostileNpc>> = { [INTRUDER]: new Intruder() };

export const isHostileKind = (kind: string): boolean => Object.hasOwn(HOSTILE_KINDS, kind);

/** Makes a hostile of `kind` in `room` and returns it. Mutates a state the caller already cloned. */
export function spawnHostile(state: GameState, kind: string, room: RoomId): HostileState {
  const def = HOSTILE_KINDS[kind];
  if (!def) throw new Error(`Unknown hostile kind ${kind}`);
  const hostile = def.create(state, `${HOSTILE_ID_PREFIX}${state.nextHostileId++}`, room);
  state.hostiles.push(hostile);
  return hostile;
}

/** The hostiles in a living player's room (none for the dead). */
export const hostilesHere = (state: Readonly<GameState>, player: Readonly<PlayerState>): HostileState[] =>
  player.alive ? state.hostiles.filter((h) => h.room === player.room) : [];

/** The hostile with this id in the player's room, if any. */
export const hostileHere = (state: Readonly<GameState>, player: Readonly<PlayerState>, id: string): HostileState | undefined =>
  hostilesHere(state, player).find((h) => h.id === id);

/**
 * The one way a hostile's HP goes down. Floors at 0; at 0 it dies: it is removed, its death is public in its room, and
 * its kind's `onDeath` runs. Mutates a state the caller already cloned.
 */
export function damageHostile(state: GameState, hostile: HostileState, amount: number): void {
  if (!state.hostiles.includes(hostile) || amount <= 0) return;
  hostile.hp = Math.max(0, hostile.hp - amount);
  if (hostile.hp > 0) return;
  state.hostiles = state.hostiles.filter((h) => h !== hostile);
  logPublic(state, hostile.room, "hostileDied", { hostile: hostile.kind });
  HOSTILE_KINDS[hostile.kind]?.onDeath(state, hostile);
}

/**
 * At each cycle change, after the item NPCs (npcs.ts): each hostile takes its turn, in spawn order. One killed before
 * its turn skips it. Mutates a state the caller already cloned.
 */
export function hostileCycle(state: GameState): void {
  for (const id of state.hostiles.map((h) => h.id)) {
    if (state.phase !== "playing") return;
    const hostile = state.hostiles.find((h) => h.id === id);
    if (hostile) HOSTILE_KINDS[hostile.kind]?.turn(state, id);
  }
}
