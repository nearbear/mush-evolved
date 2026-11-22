import { describe, expect, it } from "vitest";
import { arrangeTokens, contributionGain, poolProgress, type RelayProgressConfig, type RelayToken, rolled } from "../src/relay.ts";
import { nextFloat } from "../src/rng.ts";
import type { PlayerState } from "../src/types.ts";

// Base 6, penalty 2: the worked examples in docs/plans/archive/relay-tokens.md.
const CFG: RelayProgressConfig = { rate: 6, mod: 10, skillBoost: 4, relayPenalty: 2 };
const tok = (by: string, base = 6, roll = 0): RelayToken => ({ by, base, roll });
const many = (by: string, n: number, base = 6) => Array.from({ length: n }, () => tok(by, base));
const progress = (tokens: RelayToken[], cfg = CFG) => poolProgress({ tokens }, cfg, Number.POSITIVE_INFINITY).progress;

/** A small seeded generator for the property tests. */
function rand(seed: number) {
  let s = seed;
  return () => {
    const [v, next] = nextFloat(s);
    s = next;
    return v;
  };
}

/** Every ordering's penalties: each token in a row by the same player (unpenalized ones apart) loses `penalty` more. */
function* orderings(n: number): Generator<number[]> {
  if (n === 0) return yield [];
  for (const rest of orderings(n - 1)) for (let at = 0; at <= rest.length; at++) yield [...rest.slice(0, at), n - 1, ...rest.slice(at)];
}
function bruteBestBaseSum(tokens: RelayToken[], penalty: number): number {
  let best = 0;
  for (const order of orderings(tokens.length)) {
    let total = 0;
    let last: string | null = null;
    let streak = 0;
    for (const i of order) {
      const t = tokens[i]!;
      const key = t.unpenalized ? `#${i}` : t.by;
      streak = key === last ? streak + 1 : 0;
      last = key;
      total += Math.max(0, t.base - streak * penalty);
    }
    best = Math.max(best, total);
  }
  return best;
}
const baseSum = (tokens: RelayToken[], penalty: number) => arrangeTokens(tokens, penalty).reduce((sum, p, i) => sum + Math.max(0, tokens[i]!.base - p), 0);

function randomPool(next: () => number, size: number): RelayToken[] {
  const players = 1 + Math.floor(next() * 3);
  return Array.from({ length: size }, () => {
    const t = tok(`p${Math.floor(next() * players)}`, Math.floor(next() * 12), next());
    if (next() < 0.1) t.unpenalized = true;
    return t;
  });
}

describe("relay tokens", () => {
  it("gives the worked examples' totals at minimum rolls", () => {
    expect(progress(many("A", 6))).toBe(12);
    expect(progress([...many("A", 4), ...many("B", 4)])).toBe(48);
    expect(progress([...many("A", 5), ...many("B", 2)])).toBe(38);
    // A x3 on Monday, B x3 on Tuesday: the order in time doesn't matter.
    expect(progress([...many("A", 3), ...many("B", 3)])).toBe(36);
  });

  it("matches the old streak formula for a lone contributor, 1 to 8 tokens", () => {
    for (let n = 1; n <= 8; n++) {
      let streak = 0;
      for (let k = 0; k < n; k++) streak += Math.max(0, 6 - k * CFG.relayPenalty);
      expect(progress(many("A", n))).toBe(streak);
    }
  });

  it("finds the brute-force best ordering for small random pools", () => {
    const next = rand(11);
    for (let trial = 0; trial < 300; trial++) {
      const tokens = randomPool(next, 1 + Math.floor(next() * 7));
      expect(baseSum(tokens, 2)).toBe(bruteBestBaseSum(tokens, 2));
    }
  });

  it("never lowers the rolled total when a token is added", () => {
    const next = rand(5);
    for (let trial = 0; trial < 5000; trial++) {
      const tokens = randomPool(next, 1 + Math.floor(next() * 16));
      for (let n = 1; n < tokens.length; n++) expect(progress(tokens.slice(0, n + 1))).toBeGreaterThanOrEqual(progress(tokens.slice(0, n)));
    }
  });

  it("is the same whatever order the tokens were made in", () => {
    const next = rand(3);
    for (let trial = 0; trial < 200; trial++) {
      const tokens = randomPool(next, 8);
      expect(progress([...tokens].reverse())).toBe(progress(tokens));
    }
  });

  it("rolls a value in [g, g + g/2]", () => {
    expect([rolled(6, 0), rolled(6, 0.99), rolled(4, 0.99), rolled(0, 0.99)]).toEqual([6, 9, 6, 0]);
  });

  it("gives the pool's highest roll to the highest value, not to the token that drew it", () => {
    // A lone player at base 5, 5, 5 then 6: with own rolls this fell from 12 to 11 (owner, 2026-10-31).
    const tokens = [tok("A", 5, 0.74), tok("A", 5, 0.63), tok("A", 5, 0.07), tok("A", 6, 0.115)];
    expect(progress(tokens.slice(0, 3))).toBe(12);
    expect(progress(tokens)).toBeGreaterThanOrEqual(12);
    const { values } = poolProgress({ tokens }, CFG, Number.POSITIVE_INFINITY);
    // The base-6 token takes no penalty and the 0.74 roll: 6 + floor(0.74 * 4).
    expect(values[3]).toBe(6 + 2);
  });

  it("shows waiting work only when one player holds more than everyone else plus one", () => {
    const at = (tokens: RelayToken[]) => poolProgress({ tokens }, CFG, Number.POSITIVE_INFINITY).waiting;
    expect(at(many("A", 6))).toBe(36 - 12);
    expect(at([...many("A", 3), ...many("B", 2)])).toBe(0);
    expect(at([...many("A", 4), ...many("B", 2)])).toBeGreaterThan(0);
    // Capped at completion.
    const capped = poolProgress({ tokens: many("A", 30) }, CFG, 100);
    expect(capped.waiting).toBe(100 - capped.progress);
  });

  it("treats a token made under the noRelayPenalty cheat as from a player of its own", () => {
    const free = many("A", 4).map((t) => ({ ...t, unpenalized: true as const }));
    expect(progress(free)).toBe(24);
    expect(progress([...many("A", 2), ...free.slice(0, 1)])).toBe(18);
  });

  it("gives the gain of contributing now, more than the token alone when it breaks a streak", () => {
    const you = { id: "B", skills: [], cheats: [] } as unknown as PlayerState;
    const pool = { tokens: many("A", 3) };
    // A A A = 6 + 4 + 2; with B: A B A A = 6 + 6 + 6 + 4, so +10 at the minimum roll, +13 at the top.
    expect(contributionGain(pool, CFG, you, [])).toEqual({ min: 10, max: 13 });
  });
});
