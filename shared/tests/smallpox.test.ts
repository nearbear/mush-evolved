import { describe, expect, it } from "vitest";
import { addDisease, diseaseStats } from "../src/diseases.ts";
import { cycleChanged } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import { makeSeats, testConfig } from "./support.ts";

const config = testConfig();

describe("Smallpox", () => {
  it("lasts 12 to 20 cycles", () => {
    const state = createGame(makeSeats(4), config, 3);
    const stats = diseaseStats(state, "smallpox_disease")!;
    expect([stats.durationMin, stats.durationMax]).toEqual([12, 20]);
    const human = state.players.find((p) => p.role === "human")!;
    addDisease(state, human, "smallpox_disease");
    const duration = human.diseaseTrackers.find((t) => t.name === "smallpox_disease")!.duration;
    expect(duration).toBeGreaterThanOrEqual(12);
    expect(duration).toBeLessThanOrEqual(20);
  });

  it("takes 2 from max health and max morale", () => {
    const state = createGame(makeSeats(4), config, 3);
    const human = state.players.find((p) => p.role === "human")!;
    const [hp, morale] = [human.maxHp, human.maxMorale];
    addDisease(state, human, "smallpox_disease");
    expect([human.maxHp, human.maxMorale]).toEqual([hp - 2, morale - 2]);
  });

  it("sometimes costs 1 MP and sometimes 2 health at a cycle change, never more", () => {
    let mpLosses = 0;
    let hpLosses = 0;
    const runs = 200;
    for (let seed = 0; seed < runs; seed++) {
      const state = createGame(makeSeats(4), config, seed);
      const human = state.players.find((p) => p.role === "human")!;
      addDisease(state, human, "smallpox_disease");
      const [mp, hp] = [human.mp, human.hp];
      cycleChanged(state);
      const lostMp = mp - human.mp;
      const lostHp = hp - human.hp;
      expect([0, 1]).toContain(lostMp);
      expect([0, 2]).toContain(lostHp);
      mpLosses += lostMp;
      hpLosses += lostHp / 2;
    }
    expect(mpLosses / runs).toBeGreaterThan(0.25);
    expect(mpLosses / runs).toBeLessThan(0.55);
    expect(hpLosses / runs).toBeGreaterThan(0.35);
    expect(hpLosses / runs).toBeLessThan(0.65);
  });

  it("costs a Mush nothing at a cycle change", () => {
    const state = createGame(makeSeats(4), config, 3);
    const mush = state.players.find((p) => p.role === "mush")!;
    addDisease(state, mush, "smallpox_disease");
    const [mp, hp] = [mush.mp, mush.hp];
    for (let i = 0; i < 10; i++) cycleChanged(state);
    expect([mush.mp, mush.hp]).toEqual([mp, hp]);
  });
});
