// Seeded, deterministic RNG (mulberry32). The state is a plain number so it can
// live inside GameState and be serialized; every call returns the next state.

export type RngState = number;

export function nextFloat(state: RngState): [value: number, next: RngState] {
  let t = (state + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Integer in [0, max). */
export function nextInt(state: RngState, max: number): [value: number, next: RngState] {
  const [f, next] = nextFloat(state);
  return [Math.floor(f * max), next];
}

/** Uniform integer in [min, max]. */
export function rollRange(rng: RngState, [min, max]: readonly [number, number]): [number, RngState] {
  const [n, next] = nextInt(rng, max - min + 1);
  return [min + n, next];
}

/** Anything that holds the game's RNG, such as a GameState. */
export interface HasRng {
  rng: RngState;
}

// The roll helpers advance `holder.rng` themselves and return only the value, so a roll can't forget to move the
// state on (dropping the next state repeats the same roll). Use them in rule code that mutates an already-cloned state.

/** Float in [0, 1); advances `holder.rng`. */
export function rollFloat(holder: HasRng): number {
  const [value, next] = nextFloat(holder.rng);
  holder.rng = next;
  return value;
}

/** Integer in [0, max); advances `holder.rng`. */
export function rollInt(holder: HasRng, max: number): number {
  const [value, next] = nextInt(holder.rng, max);
  holder.rng = next;
  return value;
}

/** Uniform integer in [min, max]; advances `holder.rng`. */
export function roll(holder: HasRng, range: readonly [number, number]): number {
  const [value, next] = rollRange(holder.rng, range);
  holder.rng = next;
  return value;
}

/** An index into `weights`, each drawn in proportion to its weight (at least one must be positive); advances `holder.rng`. */
export function rollWeighted(holder: HasRng, weights: readonly number[]): number {
  let pick = rollFloat(holder) * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < weights.length; i++) {
    pick -= weights[i]!;
    if (pick < 0) return i;
  }
  return weights.length - 1;
}

/** Fisher-Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], state: RngState): [result: T[], next: RngState] {
  const result = [...items];
  let s = state;
  for (let i = result.length - 1; i > 0; i--) {
    let j: number;
    [j, s] = nextInt(s, i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return [result, s];
}

/** Fisher-Yates shuffle into a new array; advances `holder.rng`. */
export function rollShuffle<T>(holder: HasRng, items: readonly T[]): T[] {
  const [result, next] = shuffle(items, holder.rng);
  holder.rng = next;
  return result;
}

/** murmur3's 32-bit finalizer: every input bit flips each output bit with about even odds. */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h | 0;
}

/**
 * The starting state of a named stream of its own, derived from the game seed: a setup draw (such as the drugs) rolls
 * on it instead of `state.rng`, so adding or changing that draw doesn't shift every later roll. The name and seed are
 * hashed (FNV-1a, then `fmix32`) rather than added: mulberry32 steps its state by a fixed constant, so states that
 * differ by a multiple of that step replay the same sequence offset, and `seed + k` streams would overlap.
 */
export function streamFor(seed: number, name: string): RngState {
  let h = 0x811c9dc5;
  const mix = (byte: number) => {
    h = Math.imul(h ^ byte, 0x01000193);
  };
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    mix(c & 0xff);
    mix(c >>> 8);
  }
  for (let i = 0; i < 4; i++) mix((seed >>> (8 * i)) & 0xff);
  return fmix32(h);
}
