// Planets found at the Astro terminal (plan and decisions: docs/astro-plan.md, owner 2026-10-19). Each player's planets are
// private to them (`GameState.planets`); `viewFor` sends your own with the unknown sectors' tags stripped.
import { nextInt, shuffle, type RngState } from "./rng.ts";
import type { GameState, Planet } from "./types.ts";

/**
 * The tags a planet can generate, from the original's `planetTags` sheet (`Mush/derived/data/DataExplore/planetTags.json`):
 * `we` is the draw weight, `seek` how easy the tag is to spot by analysis, `max` how many one planet can have. LANDING and
 * LOST have weight 0 there (they only matter to exploration), so they are left out. The client names each tag by its id.
 */
export const PLANET_TAGS = {
  FOREST: { we: 8, seek: 12, max: 4 },
  MOUNTAIN: { we: 8, seek: 8, max: 4 },
  SWAMP: { we: 8, seek: 8, max: 4 },
  DESERT: { we: 12, seek: 12, max: 4 },
  OCEAN: { we: 8, seek: 12, max: 4 },
  CAVE: { we: 4, seek: 2, max: 4 },
  RUMINANT: { we: 8, seek: 4, max: 4 },
  PREDATOR: { we: 8, seek: 2, max: 4 },
  INTELLIGENT: { we: 8, seek: 4, max: 4 },
  INSECT: { we: 10, seek: 2, max: 4 },
  MANKAROG: { we: 2, seek: 4, max: 1 },
  HYDROCARBON: { we: 5, seek: 2, max: 2 },
  OXYGEN: { we: 8, seek: 12, max: 1 },
  COLD: { we: 8, seek: 8, max: 4 },
  HOT: { we: 8, seek: 8, max: 4 },
  STRONG_WIND: { we: 8, seek: 8, max: 4 },
  SISMIC_ACTIVITY: { we: 3, seek: 8, max: 4 },
  VOLCANIC_ACTIVITY: { we: 3, seek: 8, max: 4 },
  RUINS: { we: 2, seek: 2, max: 4 },
  WRECK: { we: 2, seek: 1, max: 4 },
  FRUIT_TREES: { we: 3, seek: 1, max: 4 },
  CRISTAL_FIELD: { we: 2, seek: 4, max: 1 },
} as const satisfies Record<string, { we: number; seek: number; max: number }>;

export type PlanetTag = keyof typeof PLANET_TAGS;
export const PLANET_TAG_IDS = Object.keys(PLANET_TAGS) as PlanetTag[];

/** Name syllables, from the original's `planet_syl` sheet: a start, an optional middle, an end, and an optional extra word. Proper nouns, not translated. */
const SYLLABLES: readonly (readonly string[])[] = [
  // i18n-ignore: generated proper nouns
  "Fugu Pilu Mage Frome Grune Brate Milo Komo Date Sigu Crame Fari Mushe Dago Cari Sopi Nato Sube Ludi Miche Pample Noce Gouli Kafto Suppo Bani Grumo Cele Mura Fanto Epso Uri Yoga Yami Doro Pila Manche Atlan Biro Popo Papu Pogo Pyro Pouli Pale Manti Fulme".split(" "),
  "ba si sho go ga be re ra mou nou bu cha bi do pu pa pe lo la li ja je va vo vu".split(" "),
  "nys nède lune gone gon bon don rys ride ïde oïne gonde laise ter tune cure nous node lode ide leïde ta na pia nia tia bia ba ma meha los bos ros".split(" "),
  // i18n-ignore: generated proper nouns
  "Primus Secondus Tertius Quartus First Second II III IV V VI VII VIII IX X Lumis Alpha Beta Ceta Delta Epsilon Gamma Zeta Eta Sigma Omicron Upsilon Lambda Omega Kappa Iota Theta Tau Psi".split(" "),
];

/**
 * A new planet, following the original's `Gameplay.getPlanet` (Mush/src/common/Gameplay.hx:98): 2 to 12 sectors (normal
 * difficulty), each drawn by weight from the tags that haven't hit their `max`, then shuffled; every sector starts unknown.
 * Differences: everything uses the game's seeded RNG (the original picked syllables with an unseeded one), and an exhausted
 * tag's weight leaves the total, so every sector gets a tag (the original kept the old total and could leave sectors empty).
 */
export function generatePlanet(rng: RngState, id: string): [planet: Planet, next: RngState] {
  let s = rng;
  const roll = (max: number): number => {
    let n: number;
    [n, s] = nextInt(s, max);
    return n;
  };
  const size = 2 + roll(6) * 2;
  const left = new Map(PLANET_TAG_IDS.map((tag) => [tag, PLANET_TAGS[tag].max as number]));
  const tags: PlanetTag[] = [];
  for (let i = 0; i < size; i++) {
    const pool = PLANET_TAG_IDS.filter((tag) => (left.get(tag) ?? 0) > 0);
    let r = roll(pool.reduce((sum, tag) => sum + PLANET_TAGS[tag].we, 0));
    const tag = pool.find((t) => (r -= PLANET_TAGS[t].we) < 0)!;
    tags.push(tag);
    left.set(tag, left.get(tag)! - 1);
  }
  let sectors: PlanetTag[];
  [sectors, s] = shuffle(tags, s);
  const pick = (table: number) => SYLLABLES[table]![roll(SYLLABLES[table]!.length)]!;
  let name = pick(0);
  if (roll(10) === 0) name += pick(1);
  if (roll(40) === 0) name += pick(1);
  name += pick(2);
  if (roll(3) === 0) name += ` ${pick(3)}`;
  else if (roll(30) === 0) name = `${pick(3)} ${name}`;
  return [{ id, name, sectors: sectors.map((tag) => ({ tag, known: false })) }, s];
}

/** Index of the sector an analysis reveals: an unknown one, weighted by its tag's `seek`; null when all are known. */
export function pickSeekSector(rng: RngState, planet: Readonly<Planet>): [index: number | null, next: RngState] {
  const unknown = planet.sectors.flatMap((sector, i) => (sector.known ? [] : [i]));
  if (unknown.length === 0) return [null, rng];
  const total = unknown.reduce((sum, i) => sum + PLANET_TAGS[planet.sectors[i]!.tag].seek, 0);
  let [r, next] = nextInt(rng, total);
  return [unknown.find((i) => (r -= PLANET_TAGS[planet.sectors[i]!.tag].seek) < 0)!, next];
}

/** A player's planets (empty if none). */
export const planetsOf = (state: Readonly<GameState>, playerId: string): readonly Planet[] => state.planets[playerId] ?? [];

/** The Astro terminals in the player's room. */
export const astroTerminalsHere = (state: Readonly<GameState>, room: string) =>
  (state.config.equipment[room] ?? []).filter((equipment) => equipment.type === "ASTRO_MODULE");
