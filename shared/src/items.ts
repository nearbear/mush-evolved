// Items and where they are. Every item sits in exactly one container: a
// player's inventory (a few private slots) or a room (unlimited, visible to
// whoever is in it). Rules about who may put what where go through the
// functions here, so a change like 4 slots, a backpack modifier, or access
// controls on lockers touches one place.

import { inventorySlots } from "./modifiers.ts";
import type { Container, GameState, ItemState, PlayerState } from "./types.ts";

export interface ItemType {
  /** Drinking or eating it removes it and does this. */
  consume?: { ap: number; /** Satiety a human gains (confirmed 2026-10-14). */ satiety: number };
  /** Cooking it (in a cook room) turns it into this item type. */
  cook?: { into: string };
  /** Carrying one makes every room-to-room move cost `heavyMpPenalty` more MP, once however many you carry (confirmed 2026-10-16). Skills may cancel it. */
  heavy?: boolean;
  canDrop?: boolean;
  dismantle?: { metal: number; plastic: number };
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

/** A dead player's body (death.ts); `ItemState.of` says whose. */
export const CORPSE_ITEM = "corpse";

export const ITEM_TYPES: Record<string, ItemType> = {
  [ITRACKIE_ITEM]: {},
  wrench: {},
  blaster: { dismantle: { metal: 1, plastic: 0 } },
  // Healing (confirmed 2026-10-15): hold one to heal. Reusable.
  medikit: {},
  // Confirmed 2026-10-13: +2 AP. Satiety +1 is a placeholder (2026-10-14).
  coffee: { consume: { ap: 2, satiety: 1 } },
  // PLACEHOLDER food (2026-10-14): +4 satiety, no AP.
  // Confirmed 2026-10-16: cook it in the refectory for 1 AP; not edible raw.
  uncooked_ration: { cook: { into: "cooked_ration" } },
  cooked_ration: { consume: { ap: 0, satiety: 4 } },
  camera: { canDrop: false, dismantle: { metal: 1, plastic: 0 }  },
  // Showering with soap in your inventory costs 1 less AP (confirmed 2026-10-14). Reusable.
  soap: {},
  metal_scraps: {},
  plastic_scraps: {},
  // Confirmed 2026-10-16: spawns in the refectory at the start; heavy.
  freezer: { heavy: true },
  // Decided 2026-10-16: a dead player's body (death.ts). Takes one slot like any item; heavy.
  [CORPSE_ITEM]: { heavy: true },
};

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

/**
 * Creates an item for a player. It goes to their inventory if there is room;
 * otherwise they "knock it over" and it lands in the room (confirmed
 * 2026-10-13). Every action that produces an item should go through here.
 * Mutates a state the caller already cloned.
 */
export function produceItem(next: GameState, player: Readonly<PlayerState>, type: string): { item: ItemState; inInventory: boolean } {
  const mine: Container = { kind: "player", id: player.id };
  const inInventory = hasSpace(next, mine);
  const item: ItemState = { id: `item-${next.nextItemId++}`, type, at: inInventory ? mine : { kind: "room", id: player.room } };
  next.items.push(item);
  return { item, inInventory };
}
