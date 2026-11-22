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
