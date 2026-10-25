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
