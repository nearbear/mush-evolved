import { describe, expect, it } from "vitest";
import { nextFloat, nextInt, roll, rollFloat, rollInt, rollRange, rollShuffle, rollWeighted, shuffle, streamFor } from "../src/rng.ts";
import { DEFAULT_CONFIG, PRESELECTION } from "../src/config.ts";
import { createGame } from "../src/rules.ts";
import { makeSeats } from "./support.ts";

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

describe("streamFor", () => {
  /** The first `n` states a stream passes through. */
  const states = (start: number, n: number) => {
    const out: number[] = [];
    let s = start;
    for (let i = 0; i < n; i++) out.push((s = nextFloat(s)[1]));
    return out;
  };

  it("gives the same stream for the same seed and name", () => {
    expect(streamFor(42, "drugs")).toBe(streamFor(42, "drugs"));
    expect(states(streamFor(42, "drugs"), 5)).toEqual(states(streamFor(42, "drugs"), 5));
  });

  it("gives streams that don't overlap each other or the main one, over many seeds", () => {
    // mulberry32 steps by a constant, so two streams overlap exactly when one passes through a state the other does.
    for (let seed = 0; seed < 2000; seed++) {
      const all = [seed, streamFor(seed, "drugs"), streamFor(seed, "medlab-stock")].flatMap((start) => states(start, 64));
      if (new Set(all).size !== all.length) expect.fail(`streams overlap for seed ${seed}`);
      expect(nextFloat(streamFor(seed, "drugs"))[0]).not.toBe(nextFloat(streamFor(seed, "medlab-stock"))[0]);
    }
  });

  it("differs between neighbouring seeds and names", () => {
    expect(streamFor(1, "drugs")).not.toBe(streamFor(2, "drugs"));
    expect(streamFor(1, "drugs")).not.toBe(streamFor(1, "drugz"));
  });
});

describe("createGame's setup draws", () => {
  it("leave the main stream as the role shuffle and the first rebel call leave it", () => {
    for (const seed of [1, 7, 123456]) {
      const seats = makeSeats(16);
      const [, afterShuffle] = shuffle(seats, seed);
      // Pre-selection: only the seat shuffle rolls on the main stream.
      expect(createGame(seats, { ...DEFAULT_CONFIG, preselection: PRESELECTION }, seed).rng).toBe(afterShuffle);
      // A full launch: plus the first rebel base's window, one roll.
      expect(createGame(seats, { ...DEFAULT_CONFIG, preselection: null }, seed).rng).toBe(nextFloat(afterShuffle)[1]);
    }
  });
});
