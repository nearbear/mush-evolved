// Items and where they are. Every item sits in exactly one container: a
// player's inventory (a few private slots) or a room (unlimited, visible to
// whoever is in it). Rules about who may put what where go through the
// functions here, so a change like 4 slots, a backpack modifier, or access
// controls on lockers touches one place.

import { inventorySlots } from "./modifiers.ts";
import type { Container, DeepReadonly, GameConfig, GameState, ItemState, PlayerState, RoomId } from "./types.ts";
import { ALIEN_FRUIT_ITEMS, BOOK_ITEM, ITRACKIE_ITEM } from "./itemIds.ts";

export { ALIEN_FRUIT_ITEMS, BOOK_ITEM, ITRACKIE_ITEM } from "./itemIds.ts";
export type { AlienFruitItem } from "./itemIds.ts";

export interface ItemType {
  /** Drinking or eating it removes it and does this. */
  consume?: {
    ap: number;
    mp?: number;
    /** Satiety the eater gains (confirmed 2026-10-14; Mush too, owner 2026-11-05). */ satiety: number;
    /** Morale the eater gains (negative: loses), within 0 and `maxMorale`. */ morale?: number;
    /** HP the eater gains, up to `maxHp`. Never lowers HP: losses go through `damage`. */ hp?: number;
  };
  /** Perishable food (spoilage.ts): it spoils one stage at each day change. Owner, 2026-11-18, eMush's list: coffee, cooked rations, bananas and alien fruits. */
  perishable?: boolean;
  /** A fruit: sowing it in an empty hydropot grows a plant of this species (its own type), which produces more of it (botany.ts). */
  fruit?: boolean;
  /** A drug (drugs.ts): consuming it applies the effects drawn for this ship, and full belly does not stop it. */
  drug?: boolean;
  /** Cooking it (in a cook room) turns it into this item type. */
  cook?: { into: string };
  /** Hyperfreezing it (with a reachable working freezer) turns it into this item type. */
  hyperfreeze?: { into: string };
  /** Carrying one makes every room-to-room move cost `heavyMpPenalty` more MP, once however many you carry (confirmed 2026-10-16). Skills may cancel it. */
  heavy?: boolean;
  canDrop?: boolean;
  /** What dismantling it leaves in the room: scraps, plus `extra` item types (the Lizaro Jungle's thick tube). `chance` replaces `config.dismantle.successChance` for this type. */
  dismantle?: { metal: number; plastic: number; extra?: string[]; chance?: number };
  /** Can break (`breakItem`). A broken item can't be used; carrying, dropping, giving, examining and dismantling it still work. */
  canBreak?: boolean;
  /** Breaking it destroys it instead of leaving it broken. Only read for `canBreak` types. */
  isDestroyedWhenBroken?: boolean;
  /** Chance that Repair fixes it (before the wrench and Technician factors). Without one, a broken item can't be repaired. */
  repairChance?: number;
  /** A Mush can sabotage it (actions/sabotage.ts), if it can also break (`canBreak`). */
  canBeSabotaged?: boolean;
  canBreakOnCycleChange?: boolean;
  /** False: it can't be hidden (actions/hide.ts). Anything that can be dropped can be hidden otherwise. */
  canHide?: boolean;
  /** An electrical overload (incidents.ts) breaks it when it lies on the floor of the room hit (owner, 2026-11-11: drones). */
  breaksInOverload?: boolean;
  /** True while the item has no gameplay effects yet; the UI shows a "Not implemented" caption. */
  notImplemented?: boolean;
}

/**
 * Every kind of item. PLACEHOLDERS (2026-10-11): these have no effects yet;
 * they exist so the inventory can be played with. Replace once items are decided.
 */
/** A dead player's body (death.ts); `ItemState.of` says whose. */
export const CORPSE_ITEM = "corpse";

/** A support drone (#411): an NPC item that repairs and wanders the ship each cycle change (drones.ts). */
export const SUPPORT_DRONE_ITEM = "support_drone";
/** Schrödinger, Raluca's cat (schrodinger.ts). */
export const CAT_ITEM = "body_cat";

/** Express cooks rations (actions/express_cook.ts) while it has charges. */
export const MICROWAVE_ITEM = "microwave";

/** Hyperfreezes cooked rations and alien steaks into uncooked rations (actions/hyperfreeze.ts). */
export const FREEZER_ITEM = "freezer";

/** The hydropot: an empty one takes a sown fruit, a planted one grows (`ItemState.plant`, botany.ts). */
export const TREE_POT_ITEM = "tree_pot";

/** A unit of fuel in transit between a tank and the combustion chamber; each takes a slot like any item (owner, 2026-10-23). */
export const FUEL_CAPSULE_ITEM = "fuel_capsule";

/** A unit of oxygen in transit between the oxygen tanks (owner, 2026-10-24); named after its icon, `oxy_capsule`. */
export const OXYGEN_CAPSULE_ITEM = "oxy_capsule";

/** Debris from a destroyed hunter (owner, 2026-10-24, patrol plan answer 6): opening it turns it into a random item (actions/open_capsule.ts). */
export const SPACE_CAPSULE_ITEM = "space_capsule";

/** Produced by completing the STEROIDS research (owner, 2026-11-01); consuming gives 8 MP and resets starvation. */
/** The Spore Sucker (eMush's spore extractor, named after its icon): the completed SPORE_EXTRACTOR research leaves one in the lab. */
export const SPORE_SUCKER_ITEM = "spore_extractor";
export const STEROIDS_ITEM = "steroids";
export const STEROIDS_YIELD = 4;
export const STEROIDS_MP = 8;

/** The customized blaster spawned by picking the `infantryman` skill (modifiers/infantryman.ts). */
export const CUSTOMIZED_BLASTER_ITEM = "customized_blaster";

/** Hacker kit: lets a player attempt to hack equipment/terminals. */
export const HACKER_KIT_ITEM = "hacker_kit";

/** The drugs (drugs.ts): their effects are drawn per ship, so each is only a consumable here. */
export const DRUG_ITEMS: readonly string[] = Array.from({ length: 12 }, (_, i) => `drug_${i}`);

/** The charges an item of this type starts with, or undefined if it has none. Charged weapons start full. */
export function startCharges(config: DeepReadonly<GameConfig>, type: string): number | undefined {
  if (type === MICROWAVE_ITEM) return config.expressCook.charges.start;
  if (type === "scooter") return config.scooter.charges.start;
  return config.weapons.types[type]?.charges;
}

/** Each microwave regains `expressCook.charges.perDay`, up to the max. Mutates a state the caller already cloned. */
export function rechargeMicrowaves(state: GameState): void {
  const { max, perDay } = state.config.expressCook.charges;
  for (const item of state.items) if (item.type === MICROWAVE_ITEM) item.charges = Math.min(max, (item.charges ?? 0) + perDay);
}

/** Each Antigrav Scooter regains `scooter.charges.perCycle`, up to the max. Mutates a state the caller already cloned. */
export function rechargeScooters(state: GameState): void {
  const { max, perCycle } = state.config.scooter.charges;
  for (const item of state.items) if (item.type === "scooter") item.charges = Math.min(max, (item.charges ?? 0) + perCycle);
}

/** The first working, charged Antigrav Scooter the player is carrying, if any. */
export function activeScooter(state: Readonly<GameState>, player: Readonly<PlayerState>): ItemState | undefined {
  return itemsIn(state, { kind: "player", id: player.id }).find((i) => i.type === "scooter" && isWorking(i) && (i.charges ?? 0) > 0);
}

/**
 * Combat damage after Plastenite Armor (owner, 2026-11-17): a working armor in the target's inventory takes
 * `plasteniteArmor.absorb` off a non-critical punch or weapon hit, or an expedition fight, never below 0. Several
 * armors absorb no more than one; a broken one does nothing. The callers leave out crits, instant kills, self-damage
 * and every non-combat damage.
 */
export function afterArmor(state: Readonly<GameState>, target: Readonly<PlayerState>, amount: number): number {
  if (amount <= 0) return amount;
  const armored = itemsIn(state, { kind: "player", id: target.id }).some((i) => i.type === "plastenite_armor" && isWorking(i));
  return armored ? Math.max(0, amount - state.config.plasteniteArmor.absorb) : amount;
}

export const ITEM_TYPES: Record<string, ItemType> = {
  ...Object.fromEntries(DRUG_ITEMS.map((id) => [id, { consume: { ap: 0, satiety: 0 }, drug: true, canBreak: true, isDestroyedWhenBroken: true }])),
  [ITRACKIE_ITEM]: {},
  wrench: {},
  // Owner, 2026-10-25, eMushpedia "Extincteur": puts out a fire (actions/extinguish.ts); dismantled for metal scraps.
  extinguisher: { dismantle: { metal: 1, plastic: 0, chance: 0.25 }, canBreak: true, canBeSabotaged: true, repairChance: 0.25 },
  // Weapons (owner, 2026-10-22, from the English wiki): their combat numbers are `config.weapons`. Named after their icons.
  knife: { dismantle: { metal: 1, plastic: 0, chance: 0.5 }, canBreak: true, canBeSabotaged: true, repairChance: 0.25 },
  blaster: { dismantle: { metal: 1, plastic: 0, chance: 0.25 }, canBreak: true, canBeSabotaged: true, repairChance: 0.25 },
  [CUSTOMIZED_BLASTER_ITEM]: { dismantle: { metal: 1, plastic: 0, chance: 0.25 }, canBreak: true, canBeSabotaged: true, repairChance: 0.25 },
  natamy_riffle: { dismantle: { metal: 1, plastic: 0, chance: 0.12 }, canBreak: true, canBeSabotaged: true, repairChance: 0.12 },
  // Lizaro Jungle.
  sniper_riffle: { dismantle: { metal: 1, plastic: 0, extra: ["thick_tube"], chance: 0.12 }, canBreak: true, canBeSabotaged: true, repairChance: 0.12 },
  // Old Faithful.
  machine_gun: { heavy: true, dismantle: { metal: 1, plastic: 0, chance: 0.12 }, canBreak: true, canBeSabotaged: true, repairChance: 0.12 },
  // The wiki lists no scrap for the rocket launcher; the owner chose 1 metal like the other guns.
  missile_launcher: { dismantle: { metal: 1, plastic: 0, chance: 0.12 }, canBreak: true, canBeSabotaged: true, repairChance: 0.12 },
  // Can't be dismantled.
  grenade: {},
  // Healing (confirmed 2026-10-15): hold one to heal. Reusable.
  medikit: {},
  // Owner, 2026-11-07 (#397): heals 2 HP, single use (actions/use_bandage.ts).
  bandage: {},
  // Confirmed 2026-10-13: +2 AP. Satiety +1 is a placeholder (2026-10-14).
  coffee: { consume: { ap: 2, satiety: 1 }, perishable: true, canBreak: true, isDestroyedWhenBroken: true },
  // Owner, 2026-11-05 (eMushpedia "Ration standard"): +4 AP and +4 satiety, cooked or not; Sirius adds 1 AP (comms.ts).
  // Confirmed 2026-10-16: cook it in the refectory for 1 AP.
  // Owner, 2026-10-19: edible raw, like a cooked one but for 1 morale.
  uncooked_ration: { cook: { into: "cooked_ration" }, consume: { ap: 4, satiety: 4, morale: -1 }, canBreak: true, isDestroyedWhenBroken: true  },
  cooked_ration: { consume: { ap: 4, satiety: 4 }, hyperfreeze: { into: "uncooked_ration" }, perishable: true, canBreak: true, isDestroyedWhenBroken: true  },
  // Owner, 2026-11-18: expedition loot (formerly uncooked_ration placeholder). Perishable; cooks into cooked_ration, hyperfreezes into uncooked_ration.
  alien_steak: { cook: { into: "cooked_ration" }, hyperfreeze: { into: "uncooked_ration" }, consume: { ap: 4, satiety: 4, morale: -1 }, perishable: true, canBreak: true, isDestroyedWhenBroken: true },
  camera: { canDrop: false, dismantle: { metal: 1, plastic: 0, chance: 0.25 }, canBreak: true, canBeSabotaged: true, repairChance: 0.25 },
  // Showering with soap in your inventory costs 1 less AP (confirmed 2026-10-14). Reusable.
  soap: {canBreak: true, isDestroyedWhenBroken: true},
  // Owner, 2026-10-25: the completed ANTI_MUSH_SERUM research yields one; single use (actions/vaccinate.ts). Named after its icon.
  anti_mush_serum: {},
  // Owner, 2026-11-20: the Spore Sucker; the completed SPORE_EXTRACTOR research yields one. Reusable (actions/remove_spore.ts). Named after its icon.
  [SPORE_SUCKER_ITEM]: {},
  // Owner, 2026-11-01: the completed STEROIDS research yields 4; single use, +8 MP, resets starvation.
  [STEROIDS_ITEM]: { consume: { ap: 0, mp: STEROIDS_MP, satiety: 0 }, canBreak: true, isDestroyedWhenBroken: true },
  // Decided 2026-10-17: rings in its room when a Mush acts there (mycoalarm.ts). Dismantles for one scrap metal.
  myco_alarm: { dismantle: { metal: 1, plastic: 0, chance: 0.25 }, canBreak: true, canBreakOnCycleChange: true, canBeSabotaged: true, repairChance: 0.25 },
  // Decided 2026-10-18: the HydroPot (TREE_POT in the original). Named after its icon. Owner, 2026-10-22: plants
  // grow in it (botany.ts), anywhere, carried too.
  [TREE_POT_ITEM]: {},
  // Owner, 2026-10-22: the original's banana (genFruitList): +1 AP, +1 satiety, +1 morale, +1 HP. Named after its icon.
  fruit_banana: { fruit: true, perishable: true, consume: { ap: 1, satiety: 1, morale: 1, hp: 1 } },
  // #437 (owner, 2026-11-14): 12 alien species whose rolled stats live on `state.fruits`.
  ...Object.fromEntries(ALIEN_FRUIT_ITEMS.map((id) => [id, { fruit: true, perishable: true, consume: { ap: 1, satiety: 1 } }])),
  // Owner, 2026-10-23, the wiki: one unit of fuel, taken from a tank and loaded into the combustion chamber. One slot
  // each, never dropped (actions/take_fuel.ts). Named after its icon.
  [FUEL_CAPSULE_ITEM]: { canDrop: false },
  // Owner, 2026-10-24, the wiki: one unit of oxygen, same handling as the fuel capsule (actions/take_oxygen.ts).
  [OXYGEN_CAPSULE_ITEM]: { canDrop: false },
  metal_scraps: {},
  [SPACE_CAPSULE_ITEM]: {},
  thick_tube: {dismantle: { metal: 1, plastic: 0, chance: 0.5 }},
  // Owner, 2026-11-04: the pneumatic tube pair (docs/plans/project-buffs.md, Fruit Mover). Plain items for now; no effect yet.
  input_tube: {dismantle: { metal: 1, plastic: 0, chance: 0.5 }},
  output_tube: {dismantle: { metal: 1, plastic: 0, chance: 0.5 }},
  // Decided 2026-10-16: carries a recipe in `ItemState.builds`; consumed by building.
  blueprint: {},
  plastic_scraps: {},
  // Confirmed 2026-10-16: spawns in the refectory at the start; heavy. Used by Hyperfreeze (actions/hyperfreeze.ts).
  [FREEZER_ITEM]: { heavy: true, dismantle: { metal: 2, plastic: 0, chance: 0.25 }, canBreak: true, canBeSabotaged: true, repairChance: 0.25 },
  // Owner, 2026-10-19: spawns in the refectory; heavy. Express cook spends its charges (`ItemState.charges`).
  [MICROWAVE_ITEM]: { heavy: true, dismantle: { metal: 2, plastic: 0, chance: 0.25 }, canBreak: true, canBeSabotaged: true, repairChance: 0.25 },
  // Decided 2026-10-16: a dead player's body (death.ts). Takes one slot like any item; heavy.
  [CORPSE_ITEM]: { heavy: true },
  // #411 (owner, 2026-11-11; eMushpedia "Drone de soutien"): 12% repair chance, can't be hidden or sabotaged, never
  // breaks on its own at a cycle change; fire and electrical overload break it on the floor. What it does each cycle
  // is drones.ts. Icon help_drone (web/src/art/assets.ts).
  [SUPPORT_DRONE_ITEM]: { canBreak: true, repairChance: 0.12, canHide: false, breaksInOverload: true },

  // Owner, 2026-10-28: eMush's Wavoscope. Carried, it doubles the odds of hull repair and renovation (modifiers.ts, actionSuccessRate); heavy.
  // Icon wavoscope (web/src/art/assets.ts).
  oscilloscope: { heavy: true, dismantle: { metal: 2, plastic: 0, chance: 0.06 }, canBreak: true, canBeSabotaged: true, repairChance: 0.06 },
  apron: { canBreak: true, canBeSabotaged: true, repairChance: 0.25 },
  protection_gloves: { canBreak: true, canBeSabotaged: true, repairChance: 0.25 },
  [HACKER_KIT_ITEM]: { canBreak: true, canBeSabotaged: true, repairChance: 0.06, breaksInOverload: true },
  // Owner, 2026-10-21: a skill book (the original's Apprentron) carries its skill in `ItemState.teaches`; destroyed by reading.
  [BOOK_ITEM]: {},
  // Owner, 2026-10-21: Xyloph rewards (comms.ts), dropped on the bridge. No effect yet. Named after their icons.
  mush_floppy_disk: {},
  mush_sample: {},
  // Owner, 2026-11-13 (#394): a printed document carrying `ItemState.document` (Finola's lost analysis; THE List later).
  // Read on the client; Tear destroys it (actions/tear.ts). Named after its icon.
  document: {},
  // Owner, 2026-10-25: items researches need in the lab (research.ts, RESEARCH_REQUIRES). No effect yet. Named after their icons.
  // Schrödinger, the cat: an NPC (schrodinger.ts) arriving with Raluca (owner, 2026-11-21).
  [CAT_ITEM]: {},
  // Alien artifacts, found on expeditions (owner, 2026-11-08, #357). Inert for now: their effects are later stories. Named after their icons.
  water_stick: {},
  magellan_liquid_map: {},
  rolling_boulder: {},
  alien_oil: {},
  computer_jelly: {},
  alien_holographic_tv: {},
  insectoid_shell: {},
  alien_can_opener: {},
  // A starmap fragment.
  super_map: {},
  //Items added for documenting the dismantle action (owner, 2026-10-22). Named after their icons.
  // Expedition gear (owner, 2026-11-08, #357; effects in expeditions.ts, `config.expedition.gear`). The drill (icon
  // driller) and the thermosensor (icon heat_seeker) predate it, so keep their ids.
  drill: { dismantle: { metal: 1, plastic: 0, chance: 0.5 } },
  thermosensor: { dismantle: { metal: 0, plastic: 1, chance: 0.5 } },
  quad_compass: {},
  rope: {},
  echo_sounder: {},
  trad_module: {},
  white_flag: {},
  // The white flag's ingredient, with the soap (owner, 2026-11-08). No effect.
  old_shirt: {},
  plastenite_armor: { dismantle: { metal: 0, plastic: 1, chance: 0.12 }, canBreak: true, canBeSabotaged: true, repairChance: 0.12 },
  sniper_helmet: { dismantle: { metal: 1, plastic: 1, chance: 0.12 }, canBreak: true, canBeSabotaged: true, repairChance: 0.25, notImplemented: true },
  scooter: { dismantle: { metal: 2, plastic: 1, chance: 0.25 }, canBreak: true, canBeSabotaged: true, repairChance: 0.25 },
  space_suit: { dismantle: { metal: 1, plastic: 1, chance: 0.12 }, canBreak: true, canBeSabotaged: true, repairChance: 0.06 },
  // Functionless eMush starting items (icon + "Not implemented" caption until their mechanics are built).
  mad_kube: { notImplemented: true },
  duct_tape: { notImplemented: true },
  block_of_post_it: { notImplemented: true },
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

/** Whether a player can see and use this item: its container is within reach, and it isn't hidden from them (actions/hide.ts). */
export function canReachItem(state: Readonly<GameState>, player: Readonly<PlayerState>, item: Readonly<ItemState>): boolean {
  return canReach(state, player, item.at) && (item.hiddenBy === undefined || item.hiddenBy === player.id);
}

/** The items in a container that this player can see: a room's storage minus what others hid. */
export function visibleItemsIn(state: Readonly<GameState>, container: Container, viewer: Readonly<PlayerState>): ItemState[] {
  return itemsIn(state, container).filter((i) => i.hiddenBy === undefined || i.hiddenBy === viewer.id);
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
