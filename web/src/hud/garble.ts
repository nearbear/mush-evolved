// A rebel base's message as it comes through at a given decode progress (docs/plans/archive/signals.md, step 3): a share of its
// characters equal to the missing percentage is hidden as noise, and the whole message shows at 100%. Presentation only:
// the full text is in the locale files, which ship in the client bundle anyway.
//
// Which characters hide is a fixed order per seed (the base), so the message only gets clearer as progress rises: a
// character revealed at 40% stays revealed at 60%. Spaces and punctuation-free gaps stay, so the words keep their shape.

const NOISE = ["—", "…", "●"] as const;

/** FNV-1a: a small, stable string hash. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded generator, 0 <= n < 1. */
function generator(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `text` with `100 - progress` percent of its non-space characters hidden as noise, in an order fixed by `seed`. */
export function garble(text: string, progress: number, seed: string): string {
  if (progress >= 100) return text;
  const chars = Array.from(text);
  const slots = chars.flatMap((c, i) => (/\s/.test(c) ? [] : [i]));
  const next = generator(hash(seed));
  // Fisher-Yates over the slots: the first ones in this order are the last to be revealed.
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [slots[i], slots[j]] = [slots[j]!, slots[i]!];
  }
  const hidden = Math.round((slots.length * (100 - Math.max(0, progress))) / 100);
  for (const i of slots.slice(0, hidden)) chars[i] = NOISE[hash(`${seed}:${i}`) % NOISE.length]!;
  return chars.join("");
}
