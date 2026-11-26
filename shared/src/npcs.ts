// NPCs (#411): items that act by themselves at each cycle change. eMush gives each kind its own handler (drones, the
// cat, ...); here an item type with an entry in `NPCS` is an NPC, and its `Npc` says what it does. A new kind
// (Schrödinger, schrodinger.ts) is a file exporting an `Npc` and an entry below; any state of its own goes in a field of
// `ItemState` with its normalizer and leak rule, like `ItemState.drone`. Everything here is pure and draws only from
// seeded streams, so replays hold.
//
// What an NPC is given when made (a drone's name and serial) is public from day 1, so it draws from `GameState.npcs`,
// a stream with a seed of its own (`GameSetup.npcSeed`), never from the game's `rng`: seeing a drone's name narrows
// nothing about the seed that picked the Mush (owner, 2026-11-11). Its turns at a cycle change still roll on `rng`.

import { supportDrone } from "./drones.ts";
import { CAT_ITEM, SUPPORT_DRONE_ITEM } from "./itemIds.ts";
import { schrodinger } from "./schrodinger.ts";
import { type RngState, streamFor } from "./rng.ts";
import type { GameState, ItemState, RoomId } from "./types.ts";

/** The NPCs' own stream and queues. Server-only, not in the full view: the queue lists names not yet given. */
export interface NpcState {
  rng: RngState;
  /** The names the next drones get, in order (drones.ts); refilled with a fresh shuffle when it runs out. */
  droneNames: string[];
}

/** A new game's NPC state. Without a seed of its own (tests, records from before #411) it derives one from the game's. */
export const newNpcState = (seed: number, npcSeed?: number): NpcState => ({ rng: npcSeed ?? streamFor(seed, "npcs"), droneNames: [] });

export interface Npc {
  /** Sets up the NPC's own state on a newly made item. Draws from `state.npcs` only, never `state.rng`. */
  create?: (state: GameState, item: ItemState) => void;
  /** Its turn at a cycle change, in `room`: the room it lies in or its carrier's. Mutates a state the caller already cloned. */
  act?: (state: GameState, item: ItemState, room: RoomId) => void;
}

/** Each NPC item type's behaviour. */
export const NPCS: Readonly<Record<string, Npc>> = { [SUPPORT_DRONE_ITEM]: supportDrone, [CAT_ITEM]: schrodinger };

export const isNpc = (item: Readonly<ItemState>): boolean => Object.hasOwn(NPCS, item.type);

/** Where an item is: the room it lies in, or the room of whoever carries it (the dead carry nothing, death.ts). */
export function itemRoom(state: Readonly<GameState>, item: Readonly<ItemState>): RoomId | null {
  if (item.at.kind === "room") return item.at.id;
  const id = item.at.id;
  return state.players.find((p) => p.id === id)?.room ?? null;
}

/** Sets up a new item's NPC state, if its type is an NPC. Every place that makes an item that may be an NPC calls it. */
export function initNpc(state: GameState, item: ItemState): void {
  NPCS[item.type]?.create?.(state, item);
}

/**
 * At each cycle change, after green jelly (owner, 2026-11-11, so drones answer this cycle's fires and breakdowns): each
 * NPC takes its turn, in creation order (the order of `state.items`). One made or moved during the turns keeps its
 * place; one destroyed before its turn skips it. Mutates a state the caller already cloned.
 */
export function npcCycle(state: GameState): void {
  const ids = state.items.filter(isNpc).map((i) => i.id);
  for (const id of ids) {
    if (state.phase !== "playing") return;
    const item = state.items.find((i) => i.id === id);
    const room = item && itemRoom(state, item);
    if (item && room !== null && room !== undefined) NPCS[item.type]!.act?.(state, item, room);
  }
}
