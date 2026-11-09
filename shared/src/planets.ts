// Planets found at the Astro terminal (plan and decisions: docs/plans/astro.md, owner 2026-10-19). Each player's planets are
// private to them (`GameState.planets`); `viewFor` sends your own with the unknown sectors' tags stripped.
import { nextInt, shuffle, type RngState } from "./rng.ts";
import type { GameState, Planet } from "./types.ts";

/**
 * The tags a planet can generate, from the original's `planetTags` sheet (`Mush/derived/data/DataExplore/planetTags.json`):
 * `we` is the draw weight, `seek` how easy the tag is to spot by analysis, `max` how many one planet can have, `explo` how
 * likely an expedition is to explore it (expeditions.ts). LANDING has weight 0 there (it only matters to exploration), so
 * it is left out. LOST is never generated (`max` 0): an expedition adds one, revealed, for each member who gets lost
 * (owner, 2026-11-08, #357); its `explo` is eMush's. The client names each tag by its id.
 */
export const PLANET_TAGS = {
  FOREST: { we: 8, seek: 12, max: 4, explo: 8 },
  MOUNTAIN: { we: 8, seek: 8, max: 4, explo: 8 },
  SWAMP: { we: 8, seek: 8, max: 4, explo: 8 },
  DESERT: { we: 12, seek: 12, max: 4, explo: 8 },
  OCEAN: { we: 8, seek: 12, max: 4, explo: 8 },
  CAVE: { we: 4, seek: 2, max: 4, explo: 8 },
  RUMINANT: { we: 8, seek: 4, max: 4, explo: 8 },
  PREDATOR: { we: 8, seek: 2, max: 4, explo: 6 },
  INTELLIGENT: { we: 8, seek: 4, max: 4, explo: 8 },
  INSECT: { we: 10, seek: 2, max: 4, explo: 8 },
  MANKAROG: { we: 2, seek: 4, max: 1, explo: 6 },
  HYDROCARBON: { we: 5, seek: 2, max: 2, explo: 8 },
  OXYGEN: { we: 8, seek: 12, max: 1, explo: 8 },
  COLD: { we: 8, seek: 8, max: 4, explo: 8 },
  HOT: { we: 8, seek: 8, max: 4, explo: 8 },
  STRONG_WIND: { we: 8, seek: 8, max: 4, explo: 8 },
  SISMIC_ACTIVITY: { we: 3, seek: 8, max: 4, explo: 8 },
  VOLCANIC_ACTIVITY: { we: 3, seek: 8, max: 4, explo: 6 },
  RUINS: { we: 2, seek: 2, max: 4, explo: 8 },
  WRECK: { we: 2, seek: 1, max: 4, explo: 8 },
  FRUIT_TREES: { we: 3, seek: 1, max: 4, explo: 8 },
  CRISTAL_FIELD: { we: 2, seek: 4, max: 1, explo: 10 },
  LOST: { we: 0, seek: 0, max: 0, explo: 8 },
} as const satisfies Record<string, { we: number; seek: number; max: number; explo: number }>;

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

/** The directions a planet can lie in, from the Daedalus (eMush's `SpaceOrientationEnum`). The client names them. */
export const PLANET_DIRECTIONS = ["north", "west", "south", "east"] as const;
export type PlanetDirection = (typeof PLANET_DIRECTIONS)[number];

/** A planet's place in space: a direction and a distance in fuel. */
export type PlanetPosition = { direction: PlanetDirection; distance: number };

type DistanceRules = GameState["config"]["astro"]["distance"];
type SizeRange = { min: number; max: number };

/** The positions no planet on the ship holds yet, whoever found it (owner, 2026-10-22). Deleting a planet frees its spot. */
export function freePositions(state: Readonly<GameState>): PlanetPosition[] {
  const { min, max } = state.config.astro.distance;
  const taken = new Set(Object.values(state.planets).flatMap((planets) => planets.map((p) => `${p.direction}:${p.distance}`)));
  return PLANET_DIRECTIONS.flatMap((direction) =>
    Array.from({ length: max - min + 1 }, (_, i) => ({ direction, distance: min + i })).filter((p) => !taken.has(`${p.direction}:${p.distance}`)),
  );
}

/**
 * Where a new planet lies, following eMush's `PlanetService.getCoordinatesForPlanet` (owner, 2026-10-22). Near positions
 * (`min`..`nearMax`) come first, with the distance drawn as two rolls averaged and rounded down, so middle distances are
 * likelier; only distances with a free spot count. Once every near spot is taken, `nearMax + 1` is used, then the next. The
 * direction is uniform among the free spots at that distance. Null when every position is taken.
 */
export function pickPosition(rng: RngState, free: readonly PlanetPosition[], rules: DistanceRules): [position: PlanetPosition | null, next: RngState] {
  let tier = rules.nearMax;
  while (tier <= rules.max && !free.some((p) => p.distance <= tier)) tier++;
  if (tier > rules.max) return [null, rng];
  const low = tier === rules.nearMax ? rules.min : tier;
  // The chance of each distance from two averaged rolls (eMush rerolls a distance with no free spot; weighting only the free
  // ones is the same thing without the loop).
  const weights = new Map<number, number>();
  for (let a = low; a <= tier; a++) for (let b = low; b <= tier; b++) {
    const d = Math.floor((a + b) / 2);
    if (free.some((p) => p.distance === d)) weights.set(d, (weights.get(d) ?? 0) + 1);
  }
  let total = 0;
  for (const w of weights.values()) total += w;
  let [r, s] = nextInt(rng, total);
  const distance = [...weights].find(([, w]) => (r -= w) < 0)![0];
  const here = free.filter((p) => p.distance === distance);
  let i: number;
  [i, s] = nextInt(s, here.length);
  return [here[i]!, s];
}

/** The sector counts a planet found on `day` can have: the last `sizeByDay` entry whose day has come. */
export function sizeRangeOn(rules: GameState["config"]["astro"], day: number): SizeRange {
  return rules.sizeByDay.filter((range) => range.fromDay <= day).at(-1) ?? rules.sizeByDay[0]!;
}

/**
 * A new planet at `position`, following the original's `Gameplay.getPlanet` (Mush/src/common/Gameplay.hx:98): an even number
 * of sectors from `sizes` (eMush's normal, hard and very hard ranges, by day), each drawn by weight from the tags that haven't
 * hit their `max`, then shuffled; every sector starts unknown. Differences: everything uses the game's seeded RNG (the original
 * picked syllables with an unseeded one), and an exhausted tag's weight leaves the total, so every sector gets a tag (the
 * original kept the old total and could leave sectors empty).
 */
export function generatePlanet(rng: RngState, id: string, position: PlanetPosition, sizes: SizeRange): [planet: Planet, next: RngState] {
  let s = rng;
  const roll = (max: number): number => {
    let n: number;
    [n, s] = nextInt(s, max);
    return n;
  };
  const size = sizes.min + roll(Math.floor((sizes.max - sizes.min) / 2) + 1) * 2;
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
  return [{ id, name, ...position, sectors: sectors.map((tag) => ({ tag, known: false })) }, s];
}

/** Index of the sector an analysis reveals: an unknown one, weighted by its tag's `seek`; null when all are known. */
export function pickSeekSector(rng: RngState, planet: Readonly<Planet>): [index: number | null, next: RngState] {
  const unknown = planet.sectors.flatMap((sector, i) => (sector.known ? [] : [i]));
  if (unknown.length === 0) return [null, rng];
  const total = unknown.reduce((sum, i) => sum + PLANET_TAGS[planet.sectors[i]!.tag].seek, 0);
  let [r, next] = nextInt(rng, total);
  return [unknown.find((i) => (r -= PLANET_TAGS[planet.sectors[i]!.tag].seek) < 0)!, next];
}

/** How many pictures a planet can be drawn with (the client's art); cosmetic. */
export const PLANET_PICTURES = 5;

/**
 * Which picture a planet is drawn with: cosmetic, the same for a planet every time and for every player. From its random
 * name, not its id: ids count the ship's scans, and the orbited planet's picture is public.
 */
export const planetPicture = (planet: { name: string }): number => [...planet.name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % PLANET_PICTURES;

/** A player's planets (empty if none). */
export const planetsOf = (state: Readonly<GameState>, playerId: string): readonly Planet[] => state.planets[playerId] ?? [];

/** The Astro terminals in the player's room. */
export const astroTerminalsHere = (state: Readonly<GameState>, room: string) =>
  (state.equipment[room] ?? []).filter((equipment) => equipment.type === "ASTRO_MODULE");
