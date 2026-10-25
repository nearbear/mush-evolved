import { describe, expect, it } from "vitest";
import { nextFloat, nextInt, roll, rollFloat, rollInt, rollRange, rollShuffle, shuffle } from "../src/rng.ts";

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
