// Items and where they are. Every item sits in exactly one container: a
// player's inventory (a few private slots) or a room (unlimited, visible to
// whoever is in it). Rules about who may put what where go through the
// functions here, so a change like 4 slots, a backpack modifier, or access
// controls on lockers touches one place.

import { inventorySlots } from "./modifiers.ts";
import type { Container, GameState, ItemState, PlayerState } from "./types.ts";

export interface ItemType {
  name: string;
}

/**
 * Every kind of item. PLACEHOLDERS (2026-10-11): these have no effects yet;
 * they exist so the inventory can be played with. Replace once items are decided.
 */
/**
 * The iTrackie's item type. Confirmed 2026-10-13: everyone starts with one; it
 * takes a slot and can be dropped or taken like any item. Carrying one is what
 * opens global chat and the feature threads (see chatChannels in rules.ts).
 * Named after its icon, super_talky.jpg (user's pick).
 */
export const ITRACKIE_ITEM = "super_talky";

export const ITEM_TYPES: Record<string, ItemType> = {
  [ITRACKIE_ITEM]: { name: "iTrackie" },
  wrench: { name: "Wrench" },
  blaster: { name: "Blaster" },
  medikit: { name: "Medikit" },
};

export function itemName(type: string): string {
  return ITEM_TYPES[type]?.name ?? type;
}

/** How many items a container holds at most. Rooms are unlimited. */
export function capacity(state: Readonly<GameState>, container: Container): number {
  if (container.kind === "room") return Infinity;
  const p = state.players.find((pl) => pl.id === container.id);
  return p ? inventorySlots(state, p) : 0;
}

/** Items in a container, in a stable order. */
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

/** Whether a player may move an item to a container. Doesn't check whose turn it is. */
export function canTransfer(
  state: Readonly<GameState>,
  player: Readonly<PlayerState>,
  item: Readonly<ItemState>,
  to: Container,
): boolean {
  return !sameContainer(item.at, to) && canReach(state, player, item.at) && canReach(state, player, to) && hasSpace(state, to);
}

export function sameContainer(a: Container, b: Container): boolean {
  return a.kind === b.kind && a.id === b.id;
}
