import { describe, expect, it } from "vitest";
import { addDisease } from "../src/diseases.ts";
import { apGain, apRefill, bedBonus } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, testConfig } from "./support.ts";

const config = testConfig();
const SPOILERS = ["rejuvenation_disease", "migraine_disease", "rubella_disease"];

const game = (seed: number): GameState => createGame(makeSeats(4), config, seed);

describe("a spoiled rest (Rejuvenation, Migraine, Rubella)", () => {
  it("loses the bed's bonus once, however many of them spoil it", () => {
    let spoiled = 0;
    const runs = 500;
    for (let seed = 0; seed < runs; seed++) {
      const s = game(seed);
      const p = s.players.find((pl) => pl.role === "human")!;
      p.modifiers = p.modifiers.filter((m) => m !== "hyperactive"); // Chao's bed gives nothing anyway
      for (const d of SPOILERS) addDisease(s, p, d);
      const awake = apGain(s, p);
      p.modifiers.push("lying_down");
      const bonus = bedBonus(s, p);
      expect(bonus).toBeGreaterThan(0);
      const gain = apRefill(s, p);
      // Never below what an awake player gets: the bonus can't come off twice.
      expect([awake, awake + bonus]).toContain(gain);
      if (gain === awake) spoiled++;
    }
    // Three 30% rolls: about 1 - 0.7^3 = 66% of rests are spoiled.
    expect(spoiled / runs).toBeGreaterThan(0.58);
    expect(spoiled / runs).toBeLessThan(0.74);
  });
});
