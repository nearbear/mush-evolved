import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease, diseaseStats } from "../src/diseases.ts";
import { apGain, apRefill, cycleChanged } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { GameConfig } from "../src/types.ts";
import { makeSeats, noHunters } from "./support.ts";

const config: GameConfig = { ...DEFAULT_CONFIG, mushCount: 1, preselection: null, startSkills: [], startInventory: [], startItems: [] };

const setup = (seed: number) => {
  const state = createGame(makeSeats(4), noHunters(config), seed);
  const human = state.players.find((p) => p.role === "human")!;
  const mush = state.players.find((p) => p.role === "mush")!;
  return { state, human, mush };
};

describe("Rejuvenation", () => {
  it("lasts 8 to 12 cycles", () => {
    const { state, human } = setup(3);
    const stats = diseaseStats(state, "rejuvenation_disease")!;
    expect([stats.durationMin, stats.durationMax]).toEqual([8, 12]);
    addDisease(state, human, "rejuvenation_disease");
    const duration = human.diseaseTrackers.find((t) => t.name === "rejuvenation_disease")!.duration;
    expect(duration).toBeGreaterThanOrEqual(8);
    expect(duration).toBeLessThanOrEqual(12);
  });

  it("at a cycle change sometimes costs 1 MP, sometimes makes dirty, rarely gives an incident disease", () => {
    let mp = 0;
    let dirty = 0;
    let sick = 0;
    const runs = 1000;
    for (let seed = 0; seed < runs; seed++) {
      const { state, human } = setup(seed);
      addDisease(state, human, "rejuvenation_disease");
      const before = human.mp;
      cycleChanged(state);
      expect([0, 1]).toContain(before - human.mp);
      mp += before - human.mp;
      if (human.statuses.includes("dirty")) dirty++;
      const caught = human.modifiers.filter((m) => m.endsWith("_disease") && m !== "rejuvenation_disease");
      expect(caught.length).toBeLessThanOrEqual(1);
      for (const d of caught) expect(state.config.diseases.incidentDiseases).toContain(d);
      sick += caught.length;
    }
    expect(mp / runs).toBeGreaterThan(0.4);
    expect(mp / runs).toBeLessThan(0.6);
    expect(dirty / runs).toBeGreaterThan(0.05);
    expect(dirty / runs).toBeLessThan(0.15);
    expect(sick / runs).toBeGreaterThan(0.01);
    expect(sick / runs).toBeLessThan(0.06);
  });

  it("lying down, about 30% of refills give no bed AP, and never less than the awake gain", () => {
    let rested = 0;
    const runs = 1000;
    for (let seed = 0; seed < runs; seed++) {
      const { state, human } = setup(seed);
      human.modifiers = human.modifiers.filter((m) => m !== "hyperactive"); // Chao's bed gives nothing anyway
      addDisease(state, human, "rejuvenation_disease");
      const awake = apGain(state, human);
      human.modifiers.push("lying_down");
      const gain = apRefill(state, human);
      expect([awake, awake + 1]).toContain(gain);
      if (gain > awake) rested++;
    }
    expect(rested / runs).toBeGreaterThan(0.62);
    expect(rested / runs).toBeLessThan(0.78);
  });

  it("does not touch the refill of someone awake", () => {
    const { state, human } = setup(1);
    addDisease(state, human, "rejuvenation_disease");
    const rng = state.rng;
    expect(apRefill(state, human)).toBe(apGain(state, human));
    expect(state.rng).toBe(rng);
  });

  it("costs a Mush nothing", () => {
    for (let seed = 0; seed < 50; seed++) {
      const { state, mush } = setup(seed);
      addDisease(state, mush, "rejuvenation_disease");
      mush.modifiers.push("lying_down");
      expect(apRefill(state, mush)).toBe(apGain(state, mush));
      const before = { mp: mush.mp, modifiers: [...mush.modifiers] };
      for (let i = 0; i < 10; i++) cycleChanged(state);
      expect(mush.mp).toBe(before.mp);
      expect(mush.statuses).not.toContain("dirty");
      expect(mush.modifiers).toEqual(before.modifiers);
    }
  });
});
