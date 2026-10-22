// The space behind the ship: a procedural star field in the style of the original iso client's
// backdrop (Mush/clients/iso/gfx/bg.png, CC BY-NC-SA 4.0, Motion Twin). Only its colors are taken
// from it: a navy sky, nebula dust as scattered single pixels in a violet ramp with some teal, sparse
// one-pixel stars, and a few "+" sparkles. Pure (no DOM): a seed gives the same pixels every time,
// so every player sees the same sky. The image tiles seamlessly, so a renderer can repeat it.

export interface StarfieldImage {
  /** Square: `size` x `size`. */
  size: number;
  /** Row-major RGBA, 4 bytes per pixel, fully opaque. */
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

/** The sky, every pixel nothing else covers. */
export const SKY = 0x09092d;
/** Nebula dust, faintest first. */
const DUST = [0x080066, 0x12125a, 0x220088, 0x3b00aa, 0x1000cc, 0x4400ff, 0x7600ff];
/** The teal patches in the dust, faintest first. */
const TEAL_DUST = [0x003344, 0x225566, 0x447788];
/** Lone stars, commonest first. */
const STARS = [0x225566, 0x225566, 0x447788, 0x447788, 0x224488, 0x4466aa, 0x44aacc, 0x6688cc, 0x88aacc];
/** The hot pixels in the thickest dust. */
const CORES = [0x88eeff, 0x87b3c2];
/** A "+" sparkle as the original draws it: the arms fade out, three pixels up and down, two across. */
const SPARKLE = { center: 0x87b3c2, near: 0x447788, far: 0x225566 };

export const PALETTE = [SKY, ...DUST, ...TEAL_DUST, ...STARS, ...CORES, SPARKLE.center, SPARKLE.near, SPARKLE.far];

/** A deterministic hash of integers to [0, 1). */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Value noise on a lattice of `cells` x `cells` that wraps around, at (u, v) in [0, 1). */
function noise(u: number, v: number, cells: number, seed: number): number {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const at = (i: number, j: number) => hash(mod(x0 + i, cells), mod(y0 + j, cells), seed);
  const top = at(0, 0) + (at(1, 0) - at(0, 0)) * fx;
  const bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * fx;
  return top + (bottom - top) * fy;
}

/** Octaves of noise from `cells` up, in [0, 1). */
function fbm(u: number, v: number, cells: number, octaves: number, seed: number): number {
  let sum = 0;
  let weight = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(u, v, cells << o, seed + o * 101) * weight;
    total += weight;
    weight /= 2;
  }
  return sum / total;
}

/** How thick the dust is (0 none, 1 thickest) and how teal, at (u, v); smooth, so it is sampled coarsely. */
function fields(u: number, v: number, seed: number): { dust: number; teal: number } {
  // Long bands down-right at the iso grid's 2:1 slope, like the original's: u - 2v keeps them seamless.
  // They meander, and fade in and out along their length, so the repeats don't read as stripes.
  const warp = fbm(u, v, 3, 2, seed + 1) - 0.5;
  const band = Math.max(0, Math.cos(2 * Math.PI * (u - 2 * v + 0.6 * warp))) ** 4;
  const fade = smooth(Math.min(1, Math.max(0, fbm(u, v, 2, 2, seed + 2) * 2.2 - 0.6)));
  // Clouds: the bands' clumps, and smaller patches off them.
  const cloud = fbm(u, v, 6, 5, seed + 3);
  const clouds = Math.max(0, cloud - 0.42) / 0.58;
  const dust = Math.min(1, band * fade * (0.35 + 1.1 * clouds) + clouds ** 2 * 0.9);
  const teal = Math.max(0, fbm(u, v, 8, 3, seed + 4) - 0.55) * 4;
  return { dust, teal };
}

/** Field samples are this many pixels apart, then interpolated. */
const STEP = 4;

/** The star field, `size` pixels square (a multiple of 4). */
export function starfield(size: number, seed = 1): StarfieldImage {
  const rgba = new Uint8ClampedArray(size * size * 4);
  const put = (x: number, y: number, color: number) => {
    const i = (mod(y, size) * size + mod(x, size)) * 4;
    rgba[i] = color >> 16;
    rgba[i + 1] = (color >> 8) & 0xff;
    rgba[i + 2] = color & 0xff;
    rgba[i + 3] = 255;
  };

  const n = size / STEP;
  const dust = new Float32Array(n * n);
  const teal = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const f = fields(i / n, j / n, seed);
      dust[j * n + i] = f.dust;
      teal[j * n + i] = f.teal;
    }
  }
  const sample = (grid: Float32Array, x: number, y: number) => {
    const i0 = Math.floor(x / STEP);
    const j0 = Math.floor(y / STEP);
    const fx = x / STEP - i0;
    const fy = y / STEP - j0;
    const at = (i: number, j: number) => grid[mod(j0 + j, n) * n + mod(i0 + i, n)]!;
    const top = at(0, 0) + (at(1, 0) - at(0, 0)) * fx;
    return top + (at(0, 1) + (at(1, 1) - at(0, 1)) * fx - top) * fy;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = sample(dust, x, y);
      const r = hash(x, y, seed + 10);
      // Dust is grainy: a pixel is dust at a chance that grows with the thickness, brighter where thicker.
      if (r < d ** 1.5 * 0.8) {
        const shade = hash(x, y, seed + 11);
        if (d > 0.8 && shade < 0.012) put(x, y, CORES[shade < 0.006 ? 0 : 1]!);
        else if (hash(x, y, seed + 12) < Math.min(0.6, sample(teal, x, y))) put(x, y, TEAL_DUST[Math.min(2, Math.floor(shade * d * 4))]!);
        else put(x, y, DUST[Math.min(DUST.length - 1, Math.floor(shade ** 3 * d * 9))]!);
      } else if (r > 1 - 0.0012) {
        put(x, y, STARS[Math.floor(hash(x, y, seed + 13) * STARS.length)]!);
      } else {
        put(x, y, SKY);
      }
    }
  }

  // Sparkles: at most one per 128-pixel cell, wrapping at the edges like everything else.
  const cell = 128;
  for (let cy = 0; cy < size / cell; cy++) {
    for (let cx = 0; cx < size / cell; cx++) {
      if (hash(cx, cy, seed + 20) > 0.55) continue;
      const x = cx * cell + Math.floor(hash(cx, cy, seed + 21) * cell);
      const y = cy * cell + Math.floor(hash(cx, cy, seed + 22) * cell);
      if (hash(cx, cy, seed + 23) < 0.7) {
        put(x, y, SPARKLE.center);
        for (const s of [-1, 1]) {
          put(x + s, y, SPARKLE.near);
          put(x + 2 * s, y, SPARKLE.far);
          put(x, y + s, SPARKLE.near);
          put(x, y + 2 * s, SPARKLE.far);
          put(x, y + 3 * s, SPARKLE.far);
        }
      } else {
        // A small one: a bright pixel with one-pixel arms.
        put(x, y, STARS[STARS.length - 1]!);
        for (const s of [-1, 1]) {
          put(x + s, y, STARS[4]!);
          put(x, y + s, STARS[4]!);
        }
      }
    }
  }
  return { size, rgba };
}
