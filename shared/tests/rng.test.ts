import { describe, expect, it } from "vitest";
import { nextFloat, nextInt, roll, rollFloat, rollInt, rollRange, rollShuffle, rollWeighted, shuffle } from "../src/rng.ts";

describe("roll helpers", () => {
  it("draw what the pair functions draw and leave the holder on the next state", () => {
    const float = { rng: 7 };
    expect(rollFloat(float)).toBe(nextFloat(7)[0]);
    expect(float.rng).toBe(nextFloat(7)[1]);

    const int = { rng: 7 };
    expect(rollInt(int, 10)).toBe(nextInt(7, 10)[0]);
    expect(int.rng).toBe(nextInt(7, 10)[1]);

    const range = { rng: 7 };
    expect(roll(range, [3, 9])).toBe(rollRange(7, [3, 9])[0]);
    expect(range.rng).toBe(rollRange(7, [3, 9])[1]);

    const deck = { rng: 7 };
    expect(rollShuffle(deck, [1, 2, 3, 4, 5])).toEqual(shuffle([1, 2, 3, 4, 5], 7)[0]);
    expect(deck.rng).toBe(shuffle([1, 2, 3, 4, 5], 7)[1]);
  });

  it("never repeat a draw by reusing the same state", () => {
    const holder = { rng: 7 };
    const draws = Array.from({ length: 20 }, () => rollFloat(holder));
    expect(new Set(draws).size).toBe(20);
  });
});

describe("rollWeighted", () => {
  it("draws each index in proportion to its weight, and never a zero weight", () => {
    const weights = [4, 3, 0, 1, 1, 1];
    const holder = { rng: 1 };
    const runs = 20_000;
    const counts = weights.map(() => 0);
    for (let i = 0; i < runs; i++) counts[rollWeighted(holder, weights)]!++;
    expect(counts[2]).toBe(0);
    const total = weights.reduce((a, b) => a + b, 0);
    // About 1% at 20,000 draws; a 3% band never flakes and still catches a uniform pick (20% each).
    weights.forEach((w, i) => expect(Math.abs(counts[i]! / runs - w / total), `index ${i}`).toBeLessThan(0.03));
  });
});
