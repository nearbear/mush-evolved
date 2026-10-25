// Items and where they are. Every item sits in exactly one container: a
// player's inventory (a few private slots) or a room (unlimited, visible to
// whoever is in it). Rules about who may put what where go through the
// functions here, so a change like 4 slots, a backpack modifier, or access
// controls on lockers touches one place.

import { inventorySlots } from "./modifiers.ts";
import type { Container, GameConfig, GameState, ItemState, PlayerState } from "./types.ts";

export interface ItemType {
  /** Drinking or eating it removes it and does this. */
  consume?: {
    ap: number;
    /** Satiety a human gains (confirmed 2026-10-14). */ satiety: number;
    /** Morale the eater gains (negative: loses), within 0 and `maxMorale`. */ morale?: number;
    /** HP the eater gains, up to `maxHp`. Never lowers HP: losses go through `damage`. */ hp?: number;
  };
  /** A fruit: sowing it in an empty hydropot grows a plant of this species (its own type), which produces more of it (botany.ts). */
  fruit?: boolean;
  /** Cooking it (in a cook room) turns it into this item type. */
  cook?: { into: string };
  /** Carrying one makes every room-to-room move cost `heavyMpPenalty` more MP, once however many you carry (confirmed 2026-10-16). Skills may cancel it. */
  heavy?: boolean;
  canDrop?: boolean;
  /** What dismantling it leaves in the room: scraps, plus `extra` item types (the Lizaro Jungle's thick tube). */
  dismantle?: { metal: number; plastic: number; extra?: string[] };
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

/** Express cooks rations (actions/express_cook.ts) while it has charges. */
export const MICROWAVE_ITEM = "microwave";

/** The hydropot: an empty one takes a sown fruit, a planted one grows (`ItemState.plant`, botany.ts). */
export const TREE_POT_ITEM = "tree_pot";

/** A skill book: reading it (`read_book`) fills the book slot with its `ItemState.teaches` skill. */
export const BOOK_ITEM = "book";

/** A unit of fuel in transit between a tank and the combustion chamber; each takes a slot like any item (owner, 2026-10-23). */
export const FUEL_CAPSULE_ITEM = "fuel_capsule";

/** A unit of oxygen in transit between the oxygen tanks (owner, 2026-10-24); named after its icon, `oxy_capsule`. */
export const OXYGEN_CAPSULE_ITEM = "oxy_capsule";

/** The charges an item of this type starts with, or undefined if it has none. Charged weapons start full. */
export function startCharges(config: Readonly<GameConfig>, type: string): number | undefined {
  return type === MICROWAVE_ITEM ? config.expressCook.charges.start : config.weapons.types[type]?.charges;
}

/** Each microwave regains `expressCook.charges.perDay`, up to the max. Mutates a state the caller already cloned. */
export function rechargeMicrowaves(state: GameState): void {
  const { max, perDay } = state.config.expressCook.charges;
  for (const item of state.items) if (item.type === MICROWAVE_ITEM) item.charges = Math.min(max, (item.charges ?? 0) + perDay);
}

export const ITEM_TYPES: Record<string, ItemType> = {
  [ITRACKIE_ITEM]: {},
  wrench: {},
  // Weapons (owner, 2026-10-22, from the English wiki): their combat numbers are `config.weapons`. Named after their icons.
  knife: { dismantle: { metal: 1, plastic: 0 } },
  blaster: { dismantle: { metal: 1, plastic: 0 } },
  natamy_riffle: { dismantle: { metal: 1, plastic: 0 } },
  // Lizaro Jungle.
  sniper_riffle: { dismantle: { metal: 1, plastic: 0, extra: ["thick_tube"] } },
  // Old Faithful.
  machine_gun: { heavy: true, dismantle: { metal: 1, plastic: 0 } },
  // The wiki lists no scrap for the rocket launcher; the owner chose 1 metal like the other guns.
  missile_launcher: { dismantle: { metal: 1, plastic: 0 } },
  // Can't be dismantled.
  grenade: {},
  // Healing (confirmed 2026-10-15): hold one to heal. Reusable.
  medikit: {},
  // Confirmed 2026-10-13: +2 AP. Satiety +1 is a placeholder (2026-10-14).
  coffee: { consume: { ap: 2, satiety: 1 } },
  // PLACEHOLDER food (2026-10-14): +4 satiety, no AP.
  // Confirmed 2026-10-16: cook it in the refectory for 1 AP.
  // Owner, 2026-10-19: edible raw, like a cooked one but for 1 morale.
  uncooked_ration: { cook: { into: "cooked_ration" }, consume: { ap: 0, satiety: 4, morale: -1 } },
  cooked_ration: { consume: { ap: 0, satiety: 4 } },
  camera: { canDrop: false, dismantle: { metal: 1, plastic: 0 }  },
  // Showering with soap in your inventory costs 1 less AP (confirmed 2026-10-14). Reusable.
  soap: {},
  // Decided 2026-10-17: rings in its room when a Mush acts there (mycoalarm.ts). Dismantles for one scrap metal.
  myco_alarm: { dismantle: { metal: 1, plastic: 0 } },
  // Decided 2026-10-18: the HydroPot (TREE_POT in the original). Named after its icon. Owner, 2026-10-22: plants
  // grow in it (botany.ts), anywhere, carried too.
  [TREE_POT_ITEM]: {},
  // Owner, 2026-10-22: the original's banana (genFruitList): +1 AP, +1 satiety, +1 morale, +1 HP. Named after its icon.
  fruit_banana: { fruit: true, consume: { ap: 1, satiety: 1, morale: 1, hp: 1 } },
  // Owner, 2026-10-23, the wiki: one unit of fuel, taken from a tank and loaded into the combustion chamber. One slot
  // each, never dropped (actions/take_fuel.ts). Named after its icon.
  [FUEL_CAPSULE_ITEM]: { canDrop: false },
  // Owner, 2026-10-24, the wiki: one unit of oxygen, same handling as the fuel capsule (actions/take_oxygen.ts).
  [OXYGEN_CAPSULE_ITEM]: { canDrop: false },
  metal_scraps: {},
  thick_tube: {},
  // Decided 2026-10-16: carries a recipe in `ItemState.builds`; consumed by building.
  blueprint: {},
  plastic_scraps: {},
  // Confirmed 2026-10-16: spawns in the refectory at the start; heavy.
  freezer: { heavy: true },
  // Owner, 2026-10-19: spawns in the refectory; heavy. Express cook spends its charges (`ItemState.charges`).
  [MICROWAVE_ITEM]: { heavy: true },
  // Decided 2026-10-16: a dead player's body (death.ts). Takes one slot like any item; heavy.
  [CORPSE_ITEM]: { heavy: true },

  apron: {},
  protection_gloves: {},
  // Owner, 2026-10-21: a skill book (the original's Apprentron) carries its skill in `ItemState.teaches`; destroyed by reading.
  [BOOK_ITEM]: {},
  // Owner, 2026-10-21: Xyloph rewards (comms.ts), dropped on the bridge. No effect yet. Named after their icons.
  mush_floppy_disk: {},
  mush_sample: {},
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
 * 2026-10-13). Every action that hands an item to a player goes through here;
 * actions that leave items in the room (dismantle's scraps) place them directly.
 * Mutates a state the caller already cloned.
 */
export function produceItem(next: GameState, player: Readonly<PlayerState>, type: string): { item: ItemState; inInventory: boolean } {
  const mine: Container = { kind: "player", id: player.id };
  const inInventory = hasSpace(next, mine);
  const charges = startCharges(next.config, type);
  const item: ItemState = { id: `item-${next.nextItemId++}`, type, at: inInventory ? mine : { kind: "room", id: player.room }, ...(charges !== undefined && { charges }) };
  next.items.push(item);
  return { item, inInventory };
}
