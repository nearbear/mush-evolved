// Items and where they are. Every item sits in exactly one container: a
// player's inventory (a few private slots) or a room (unlimited, visible to
// whoever is in it). Rules about who may put what where go through the
// functions here, so a change like 4 slots, a backpack modifier, or access
// controls on lockers touches one place.

import { startCharges } from "./charges.ts";
import { ITEM_TYPES } from "./itemTypes.ts";
import { inventorySlots } from "./modifiers.ts";
import type { Container, GameState, ItemState, PlayerState, RoomId } from "./types.ts";

/** Whether the player carries at least one heavy item. */
export function carriesHeavy(state: Readonly<GameState>, player: Readonly<PlayerState>): boolean {
  return itemsIn(state, { kind: "player", id: player.id }).some((i) => ITEM_TYPES[i.type]?.heavy);
}


/** How many items a container holds at most. Rooms are unlimited. */
export function capacity(state: Readonly<GameState>, container: Container): number {
  if (container.kind === "room") return Infinity;
  const p = state.players.find((pl) => pl.id === container.id);
  return p ? inventorySlots(state, p) : 0;
}

/** Items in a container, in a stable order. */
/** Whether the item works: broken items can't be used (breakage.ts). */
export const isWorking = (item: Readonly<ItemState>): boolean => !item.broken;

export function itemsIn(state: Readonly<GameState>, container: Container): ItemState[] {
  return state.items.filter((i) => sameContainer(i.at, container));
}

export function hasSpace(state: Readonly<GameState>, container: Container): boolean {
  return itemsIn(state, container).length < capacity(state, container);
}

/**
 * Whether a player can take from or put into a container right now: their own
 * inventory, or the room they are in. Access controls (locked storage, other
 * players' inventories) would go here.
 */
export function canReach(state: Readonly<GameState>, player: Readonly<PlayerState>, container: Container): boolean {
  return container.kind === "player" ? container.id === player.id : container.id === player.room;
}

/** Whether this item exists for a player at all: not hidden by someone else (actions/hide.ts), not someone else's private item. */
export const seesItem = (item: Readonly<ItemState>, viewer: Readonly<PlayerState>): boolean =>
  (item.hiddenBy === undefined || item.hiddenBy === viewer.id) && (item.privateTo === undefined || item.privateTo === viewer.id);

/** Whether a player can see and use this item: its container is within reach, and it isn't hidden from them or someone else's. */
export function canReachItem(state: Readonly<GameState>, player: Readonly<PlayerState>, item: Readonly<ItemState>): boolean {
  return canReach(state, player, item.at) && seesItem(item, player);
}

/** The items in a container that this player can see: a room's storage minus what others hid and others' private items. */
export function visibleItemsIn(state: Readonly<GameState>, container: Container, viewer: Readonly<PlayerState>): ItemState[] {
  return itemsIn(state, container).filter((i) => seesItem(i, viewer));
}

/** Whether a player may move an item to a container. Doesn't check whose turn it is. */
export function canTransfer(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  item: Readonly<ItemState>,
  to: Container,
): boolean {
  return !sameContainer(item.at, to) && canReachItem(state, player, item) && canReach(state, player, to) && hasSpace(state, to);
}

export function sameContainer(a: Container, b: Container): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/**
 * Creates an item for a player. It goes to their inventory if there is room;
 * otherwise they "knock it over" and it lands in the room (confirmed
 * 2026-10-13). Every action that hands an item to a player goes through here;
 * actions that leave items in the room (dismantle's scraps) place them directly.
 * Mutates a state the caller already cloned.
 */
/** A fresh item id. */
export const newItemId = (state: GameState): string => `item-${state.nextItemId++}`;

/** Takes an item out of the game (used up, eaten, installed, thrown out) and returns it. The caller has checked it exists. */
export function removeItem(state: GameState, id: string): ItemState {
  const index = state.items.findIndex((i) => i.id === id);
  // splice(-1) would take the last item instead.
  if (index < 0) throw new Error(`no item ${id}`);
  return state.items.splice(index, 1)[0]!;
}

/** Takes an item out of the game if it is still present, returning it (or undefined if already removed). */
export function removeItemIfPresent(state: GameState, id: string): ItemState | undefined {
  const index = state.items.findIndex((i) => i.id === id);
  if (index < 0) return undefined;
  return state.items.splice(index, 1)[0]!;
}

/**
 * Moves a carried item from `{ kind: "player", id: player.id }` to `{ kind: "room", id: player.room }`.
 * Respects `ITEM_TYPES[item.type]?.canDrop !== false` unless `bypassCanDrop` is true (e.g. combat fumbles).
 * Returns `true` if the item was moved, `false` if it was not carried by `player` or cannot be dropped.
 */
export function dropWeapon(
  state: GameState,
  player: Readonly<PlayerState>,
  item: ItemState,
  options?: { bypassCanDrop?: boolean },
): boolean {
  if (item.at.kind !== "player" || item.at.id !== player.id) return false;
  if (!options?.bypassCanDrop && ITEM_TYPES[item.type]?.canDrop === false) return false;
  const index = state.items.findIndex((i) => i.id === item.id);
  if (index < 0) return false;
  const [moved] = state.items.splice(index, 1) as [ItemState];
  delete moved.hiddenBy;
  moved.at = { kind: "room", id: player.room };
  state.items.push(moved);
  return true;
}

export function produceItem(next: GameState, player: Readonly<PlayerState>, type: string): { item: ItemState; inInventory: boolean } {
  const mine: Container = { kind: "player", id: player.id };
  const inInventory = hasSpace(next, mine);
  const charges = startCharges(next.config, type);
  const item: ItemState = { id: newItemId(next), type, at: inInventory ? mine : { kind: "room", id: player.room }, ...(charges !== undefined && { charges }) };
  next.items.push(item);
  return { item, inInventory };
}

/**
 * Spawns `count` (default 1) items of `type` on the floor of `room`, with any
 * default start charges and optional per-item `extra` fields. Mutates a state
 * the caller already cloned.
 */
export function spawnInRoom(
  state: GameState,
  room: RoomId,
  type: string,
  count = 1,
  extra?: Partial<Omit<ItemState, "id" | "type" | "at">> | (() => Partial<Omit<ItemState, "id" | "type" | "at">>),
): void {
  const charges = startCharges(state.config, type);
  for (let i = 0; i < count; i++) {
    const fields = typeof extra === "function" ? extra() : extra;
    state.items.push({ id: newItemId(state), type, at: { kind: "room", id: room }, ...(charges !== undefined && { charges }), ...fields });
  }
}
