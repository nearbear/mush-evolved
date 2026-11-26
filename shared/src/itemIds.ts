// Item ids: the type strings that code names directly. The table of what each type does is itemTypes.ts.

/** The iTrackie everyone starts with, which opens global chat and feature threads. */
export const ITRACKIE_ITEM = "super_talky";

/** Reading this skill book fills the book slot with its `ItemState.teaches` skill. */
export const BOOK_ITEM = "book";

/** The 12 seeded alien fruit item IDs (`Data.ods` `Skins` rows 1–12). */
export const ALIEN_FRUIT_ITEMS = [
  "fruit01",
  "fruit02",
  "fruit03",
  "fruit04",
  "fruit05",
  "fruit06",
  "fruit07",
  "fruit08",
  "fruit09",
  "fruit10",
  "fruit11",
  "fruit12",
] as const;

export type AlienFruitItem = (typeof ALIEN_FRUIT_ITEMS)[number];

/**
 * Graft hybrids (#438, owner 2026-11-21): one fixed item id per unordered pair of alien species, 66 in all, named
 * `graft_<lower>_<higher>` (e.g. `graft_fruit01_fruit05`). Their effects are drawn at launch (`state.hybrids`) and join
 * `state.fruits` when first grafted.
 */
export const HYBRID_FRUIT_ITEMS: readonly string[] = ALIEN_FRUIT_ITEMS.flatMap((a, i) =>
  ALIEN_FRUIT_ITEMS.slice(i + 1).map((b) => `graft_${a}_${b}`),
);

const isAlienSpecies = (id: string): id is AlienFruitItem => (ALIEN_FRUIT_ITEMS as readonly string[]).includes(id);

/** The hybrid of two different alien species, the same whichever is the fruit; null for anything else. */
export function hybridOf(a: string, b: string): string | null {
  if (a === b || !isAlienSpecies(a) || !isAlienSpecies(b)) return null;
  return a < b ? `graft_${a}_${b}` : `graft_${b}_${a}`;
}

/** A hybrid's two parent species, lower-numbered first; null if `id` is not a hybrid. */
export function hybridParents(id: string): [AlienFruitItem, AlienFruitItem] | null {
  const m = /^graft_(fruit\d\d)_(fruit\d\d)$/.exec(id);
  if (!m || !isAlienSpecies(m[1]!) || !isAlienSpecies(m[2]!) || hybridOf(m[1]!, m[2]!) !== id) return null;
  return [m[1]!, m[2]!];
}

/** An alien fruit or plant species, the 12 originals or a hybrid (Frugivore's alien bonus, the client's lore). */
export const isAlienFruitType = (id: string): boolean => isAlienSpecies(id) || hybridParents(id) !== null;

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

/** The tabulator (THE List, docs/plans/archive/the-list.md): fixed in front storage; a Tracker prints THE List on it. */
export const TABULATOR_ITEM = "tabulator";

/** The hydropot: an empty one takes a sown fruit, a planted one grows (`ItemState.plant`, botany.ts). */
export const TREE_POT_ITEM = "tree_pot";

/** A lunchbox (owner, 2026-11-21; actions/open_lunchbox.ts): each opening gives a standard ration until its charges run out. */
export const LUNCHBOX_ITEM = "lunchbox";

/** A unit of fuel in transit between a tank and the combustion chamber; each takes a slot like any item (owner, 2026-10-23). */
export const FUEL_CAPSULE_ITEM = "fuel_capsule";

/** A unit of oxygen in transit between the oxygen tanks (owner, 2026-10-24); named after its icon, `oxy_capsule`. */
export const OXYGEN_CAPSULE_ITEM = "oxy_capsule";

/** Debris from a destroyed hunter (owner, 2026-10-24, patrol plan answer 6): opening it turns it into a random item (actions/open_capsule.ts). */
export const SPACE_CAPSULE_ITEM = "space_capsule";

/** Produced by completing the MUSHICIDE_SOAP research (owner, 2026-11-24): like soap, and showering with one removes 1 contamination from a human. Reusable. */
export const SUPER_SOAP_ITEM = "super_soap";
/** The Spore Sucker (eMush's spore extractor, named after its icon): the completed SPORE_EXTRACTOR research leaves one in the lab. */
export const SPORE_SUCKER_ITEM = "spore_extractor";
/** Produced by completing the STEROIDS research (owner, 2026-11-01); consuming gives 8 MP and resets starvation. */
export const STEROIDS_ITEM = "steroids";

/** Produced by completing the NCC_LENS research (owner, 2026-11-24); carried, boosts shooting accuracy. */
export const NCC_LENS_ITEM = "ncc_lens";

/** The customized blaster spawned by picking the `infantryman` skill (modifiers/infantryman.ts). */
export const CUSTOMIZED_BLASTER_ITEM = "customized_blaster";

/** Hacker kit: lets a player attempt to hack equipment/terminals. */
export const HACKER_KIT_ITEM = "hacker_kit";

/**
 * The drugs (drugs.ts): their effects are drawn per ship, so each is only a consumable here. Ids follow the original's
 * icon files (drug_N.jpg); matched by file hash to eMush's named icons: 0 Twinoid, 1 Xenox, 2 Phuxx, 3 Eufurylate,
 * 4 Soma, 5 Spyce, 6 Newke, 7 Pinq, 8 Bacta, 9 Betapropyl, 10 Pymp, 11 Rosebud (names.*.json has each language's name).
 */
export const DRUG_ITEMS: readonly string[] = Array.from({ length: 12 }, (_, i) => `drug_${i}`);

/** The item that makes a repair `config.repair.wrenchFactor` times as likely, carried. */
export const WRENCH_ITEM = "wrench";

/** Heals, single use (actions/use_bandage.ts). */
export const BANDAGE_ITEM = "bandage";

/** Puts out a fire (actions/extinguish.ts). */
export const EXTINGUISHER_ITEM = "extinguisher";

/** The completed ANTI_MUSH_SERUM research yields one (actions/vaccinate.ts). */
export const ANTI_MUSH_SERUM_ITEM = "anti_mush_serum";

/** Spent by hull repair and renovation (actions/repair_hull.ts, actions/renovate.ts). */
export const HULL_REPAIR_ITEM = "metal_scraps";

/** The pneumatic tube pair (actions/tube_transfer.ts). */
export const INPUT_TUBE_ITEM = "input_tube";
export const OUTPUT_TUBE_ITEM = "output_tube";

/** The item type that carries a recipe (blueprints.ts). Named after its icon, blueprint.jpg. */
export const BLUEPRINT_ITEM = "blueprint";

/** The generic document item (`ItemState.document`): Finola's lost analysis (lostAnalysis.ts), and THE List (#266, actions/print_list.ts). Named after its icon. */
export const DOCUMENT_ITEM = "document";

/** Rings in its room when a Mush acts there (mycoalarm.ts). */
export const MYCO_ALARM_ITEM = "myco_alarm";

/** The Mush genome disk and the Mush test strain (Xyloph rewards, comms.ts; no effect yet). Named after their icons. */
export const GENOME_DISK_ITEM = "mush_floppy_disk";
export const MUSH_SAMPLE_ITEM = "mush_sample";
