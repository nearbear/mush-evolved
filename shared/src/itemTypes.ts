// The item table: every kind of item by id, and the flags each one carries. Behavior lives with the actions and
// systems that read these flags (actions/*.ts, drugs.ts, botany.ts, ...); containers and inventory are items.ts.

import { ALIEN_FRUIT_ITEMS, BOOK_ITEM, CAT_ITEM, CORPSE_ITEM, CUSTOMIZED_BLASTER_ITEM, DRUG_ITEMS, FREEZER_ITEM, FUEL_CAPSULE_ITEM, HACKER_KIT_ITEM, HYBRID_FRUIT_ITEMS, ITRACKIE_ITEM, type ItemTypeId, MICROWAVE_ITEM, NCC_LENS_ITEM, OXYGEN_CAPSULE_ITEM, SPACE_CAPSULE_ITEM, SPORE_SUCKER_ITEM, STEROIDS_ITEM, SUPER_SOAP_ITEM, SUPPORT_DRONE_ITEM, TABULATOR_ITEM, TREE_POT_ITEM } from "./itemIds.ts";

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
  cook?: { into: ItemTypeId };
  /** Hyperfreezing it (with a reachable working freezer) turns it into this item type. */
  hyperfreeze?: { into: ItemTypeId };
  /** Carrying one makes every room-to-room move cost `heavyMpPenalty` more MP, once however many you carry (confirmed 2026-10-16). Skills may cancel it. */
  heavy?: boolean;
  /** False: it can't be picked up (`take`) or sent by tube, so it stays where it was placed (the tabulator). */
  canTake?: boolean;
  canDrop?: boolean;
  /** What dismantling it leaves in the room: scraps, plus `extra` item types (the Lizaro Jungle's thick tube). `chance` replaces `config.dismantle.successChance` for this type. */
  dismantle?: { metal: number; plastic: number; extra?: ItemTypeId[]; chance?: number };
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
  /** False: even its owner can't rename it (rename.ts; owner, 2026-11-26: Schrödinger). Owned items can be renamed otherwise. */
  canRename?: boolean;
  /**
   * A private item (owner, 2026-11-18: the iTrackie): each one is created with `privateTo`, the only player who ever sees
   * or touches it. Taking and dropping it are private actions.
   */
  private?: boolean;
  /** An electrical overload (incidents.ts) breaks it when it lies on the floor of the room hit (owner, 2026-11-11: drones). */
  breaksInOverload?: boolean;
  /** True while the item has no gameplay effects yet; the UI shows a "Not implemented" caption. */
  notImplemented?: boolean;
}

export const STEROIDS_YIELD = 4;
export const STEROIDS_MP = 8;
export const NCC_LENS_YIELD = 2;

/** One entry per id of a generated family (drugs, alien fruits, hybrids), each a fresh `make()`. */
function familyEntries<K extends string>(ids: readonly K[], make: () => ItemType): Record<K, ItemType> {
  // The one cast: Object.fromEntries forgets its keys. `ids` lists exactly K's members, except hybrids (see HybridFruitItem).
  return Object.fromEntries(ids.map((id) => [id, make()])) as Record<K, ItemType>;
}

/** Every kind of item, by id. Typed over `ItemTypeId`, so an id without an entry, or an entry without an id, won't compile. */
export const ITEM_TYPES: Readonly<Record<ItemTypeId, ItemType>> = {
  ...familyEntries(DRUG_ITEMS, () => ({ consume: { ap: 0, satiety: 0 }, drug: true, canBreak: true, isDestroyedWhenBroken: true })),
  // Private (owner, 2026-11-18): only its owner sees it, so it can't be hidden and nothing can break it.
  [ITRACKIE_ITEM]: { private: true, canHide: false },
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
  // Owner, 2026-11-21 (#143, FOREST_DEAL): 3 standard rations, one per Open (actions/open_lunchbox.ts); gone when empty.
  lunchbox: {},
  // Owner, 2026-11-07 (#397): heals 2 HP, single use (actions/use_bandage.ts).
  bandage: {canBreak: true, isDestroyedWhenBroken: true},
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
  [SUPER_SOAP_ITEM]: { canBreak: true, isDestroyedWhenBroken: true },
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
  fruit_banana: { fruit: true, perishable: true, consume: { ap: 1, satiety: 1, morale: 1, hp: 1 }, canBreak: true, isDestroyedWhenBroken: true },
  // #437 (owner, 2026-11-14): 12 alien species whose rolled stats live on `state.fruits`.
  ...familyEntries(ALIEN_FRUIT_ITEMS, () => ({ fruit: true, perishable: true, consume: { ap: 1, satiety: 1 }, canBreak: true, isDestroyedWhenBroken: true })),
  // #438 (owner, 2026-11-21): the 66 graft hybrids, one per pair of alien species; rolled stats on `state.hybrids`.
  ...familyEntries(HYBRID_FRUIT_ITEMS, () => ({ fruit: true, perishable: true, consume: { ap: 1, satiety: 1 }, canBreak: true, isDestroyedWhenBroken: true })),
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
  blueprint: {canBreak: true, isDestroyedWhenBroken: true},
  // Development cheat (owner, 2026-11-26): the Superkube's master blueprint, any recipe, free and kept (actions/build.ts).
  master_blueprint: {},
  plastic_scraps: {},
  // Confirmed 2026-10-16: spawns in the refectory at the start; heavy. Used by Hyperfreeze (actions/hyperfreeze.ts).
  [FREEZER_ITEM]: { heavy: true, dismantle: { metal: 2, plastic: 0, chance: 0.25 }, canBreak: true, canBeSabotaged: true, repairChance: 0.25 },
  // Owner, 2026-10-19: spawns in the refectory; heavy. Express cook spends its charges (`ItemState.charges`).
  [MICROWAVE_ITEM]: { heavy: true, dismantle: { metal: 2, plastic: 0, chance: 0.25 }, canBreak: true, canBeSabotaged: true, repairChance: 0.25 },
  // Owner, 2026-11-21 (#266, docs/plans/archive/the-list.md): starts in front storage and never leaves it; breaks (also at a cycle
  // change), can be sabotaged, 12% repair (eMush's tabulatrix). Not heavy (moot), no dismantle.
  [TABULATOR_ITEM]: { canTake: false, canDrop: false, canHide: false, canBreak: true, canBreakOnCycleChange: true, canBeSabotaged: true, repairChance: 0.12 },
  // Decided 2026-10-16: a dead player's body (death.ts). Takes one slot like any item; heavy.
  [CORPSE_ITEM]: { heavy: true },
  // #411 (owner, 2026-11-11; eMushpedia "Drone de soutien"): 12% repair chance, can't be hidden or sabotaged, never
  // breaks on its own at a cycle change; fire and electrical overload break it on the floor. What it does each cycle
  // is drones.ts. Icon help_drone (web/src/art/assets.ts).
  [SUPPORT_DRONE_ITEM]: { canBreak: true, repairChance: 0.12, canHide: false, breaksInOverload: true },

  // Owner, 2026-10-28: eMush's Wavoscope. Carried, it doubles the odds of hull repair and renovation (modifiers.ts, actionSuccessRate); heavy.
  // Icon wavoscope (web/src/art/assets.ts).
  oscilloscope: { heavy: true, dismantle: { metal: 2, plastic: 0, chance: 0.06 }, canBreak: true, canBeSabotaged: true, repairChance: 0.06 },
  [NCC_LENS_ITEM]: {},
  apron: { canBreak: true, canBeSabotaged: true, repairChance: 0.25 },
  protection_gloves: { canBreak: true, canBeSabotaged: true, repairChance: 0.25 },
  [HACKER_KIT_ITEM]: { canBreak: true, canBeSabotaged: true, repairChance: 0.06, breaksInOverload: true },
  // Owner, 2026-10-21: a skill book (the original's Apprentron) carries its skill in `ItemState.teaches`; destroyed by reading.
  [BOOK_ITEM]: {canBreak: true, isDestroyedWhenBroken: true},
  // Owner, 2026-10-21: Xyloph rewards (comms.ts), dropped on the bridge. No effect yet. Named after their icons.
  mush_floppy_disk: {},
  mush_sample: {},
  // Owner, 2026-11-13 (#394): a printed document carrying `ItemState.document` (Finola's lost analysis; THE List later).
  // Read on the client; Tear destroys it (actions/tear.ts). Named after its icon.
  document: {canBreak: true, isDestroyedWhenBroken: true},
  // Owner, 2026-10-25: items researches need in the lab (research.ts, RESEARCH_REQUIRES). No effect yet. Named after their icons.
  // Schrödinger, the cat: an NPC (schrodinger.ts) arriving with Raluca (owner, 2026-11-21). Never renamed (owner, 2026-11-26).
  [CAT_ITEM]: { canRename: false },
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
  old_shirt: {canBreak: true, isDestroyedWhenBroken: true},
  plastenite_armor: { dismantle: { metal: 0, plastic: 1, chance: 0.12 }, canBreak: true, canBeSabotaged: true, repairChance: 0.12 },
  sniper_helmet: { dismantle: { metal: 1, plastic: 1, chance: 0.12 }, canBreak: true, canBeSabotaged: true, repairChance: 0.25, notImplemented: true },
  scooter: { dismantle: { metal: 2, plastic: 1, chance: 0.25 }, canBreak: true, canBeSabotaged: true, repairChance: 0.25 },
  space_suit: { dismantle: { metal: 1, plastic: 1, chance: 0.12 }, canBreak: true, canBeSabotaged: true, repairChance: 0.06 },
  // Functionless eMush starting items (icon + "Not implemented" caption until their mechanics are built).
  mad_kube: { notImplemented: true },
  duct_tape: { notImplemented: true },
  block_of_post_it: { notImplemented: true },
};

const ITEM_TYPE_IDS: ReadonlySet<string> = new Set(Object.keys(ITEM_TYPES));

/** Whether `s` names an item type. Narrows strings from outside the rules (intents, cheats, stored states). */
export const isItemTypeId = (s: string): s is ItemTypeId => ITEM_TYPE_IDS.has(s);

/** The type of the item with this id, or undefined if there is no such item. */
export const itemTypeOf = (state: { readonly items: readonly { readonly id: string; readonly type: ItemTypeId }[] }, itemId: string): ItemType | undefined => {
  const item = state.items.find((i) => i.id === itemId);
  return item && ITEM_TYPES[item.type];
};
