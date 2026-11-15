import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease, diseaseStats } from "../src/diseases.ts";
import { cycleChanged, enterRoom } from "../src/modifiers.ts";
import { createGame, newCycle } from "../src/rules.ts";
import { nextInt } from "../src/rng.ts";
import type { GameConfig } from "../src/types.ts";
import { makeSeats, must, noHunters, player } from "./support.ts";

const config: GameConfig = {
  ...DEFAULT_CONFIG,
  mushCount: 1,
  preselection: null,
  startSkills: [],
  startInventory: [],
  startItems: [],
  // No cycle spread here: its rolls would move the RNG the seeded tests below follow.
  diseases: { ...DEFAULT_CONFIG.diseases, allDiseaseStats: DEFAULT_CONFIG.diseases.allDiseaseStats.map(({ cycleSpread: _c, ...rest }) => rest) },
};

describe("Cold disease", () => {
  it("decrements the randomized disease duration when the cycle advances", () => {
    const state = createGame(makeSeats(4), noHunters(config), 0);
    const sick = player(state, "p0");
    addDisease(state, sick, "cold_disease");
    const tracker = sick.diseaseTrackers[0];
    if (!tracker) throw new Error("Expected a cold disease tracker");
    const initialDuration = tracker.duration;

    const next = must(newCycle(state));

    expect(initialDuration).toBeGreaterThanOrEqual(8);
    expect(initialDuration).toBeLessThanOrEqual(12);
    expect(player(next, "p0").diseaseTrackers).toMatchObject([
      { name: "cold_disease", duration: initialDuration - 1 },
    ]);
  });

  it("uses a seeded 1-in-3 roll to remove 1 MP and logs only the affected player", () => {
    for (let seed = 0; seed < 30; seed++) {
      const state = createGame(makeSeats(4), config, seed);
      state.rng = seed;
      const sick = player(state, "p0");
      sick.modifiers.push("cold_disease");
      sick.mp = 5;

      const [roll] = nextInt(seed, 3);
      cycleChanged(state);

      expect(sick.mp).toBe(roll === 0 ? 4 : 5);
      expect(state.log.some((entry) => entry.key === "coldDiseaseMpLost")).toBe(roll === 0);
      if (roll === 0) {
        expect(state.log.find((entry) => entry.key === "coldDiseaseMpLost")?.visibleTo).toEqual(["p0"]);
      }
    }
  });

  it("does not reduce MP below zero", () => {
    const seed = Array.from({ length: 30 }, (_, value) => value).find((value) => nextInt(value, 3)[0] === 0);
    if (seed === undefined) throw new Error("Expected a seed that rolls the cold effect");
    const state = createGame(makeSeats(4), config, seed);
    state.rng = seed;
    const sick = player(state, "p0");
    sick.modifiers.push("cold_disease");
    sick.mp = 0;

    cycleChanged(state);

    expect(sick.mp).toBe(0);
    expect(state.rng).toBe(nextInt(seed, 3)[1]);
  });

  it("does not affect a player without the disease", () => {
    const state = createGame(makeSeats(4), config, 0);
    state.rng = 0;
    const healthy = player(state, "p0");
    healthy.mp = 5;

    cycleChanged(state);

    expect(healthy.mp).toBe(5);
    expect(state.log.some((entry) => entry.key === "coldDiseaseMpLost")).toBe(false);
  });

  it("spreads from a sick player to the other, whoever walks in", () => {
    for (const mover of ["sick", "healthy"] as const) {
      const state = createGame(makeSeats(4), config, 1);
      const stats = diseaseStats(state, "cold_disease");
      if (stats) state.config.diseases.allDiseaseStats[0] = { ...stats, roomSpread: 1 }; // replaced, not edited: the stats object may be shared
      const sick = player(state, "p0");
      const healthy = player(state, "p1");
      addDisease(state, sick, "cold_disease");
      sick.room = healthy.room = "FRONT_CORRIDOR";
      enterRoom(state, mover === "sick" ? sick : healthy);
      expect(healthy.modifiers).toContain("cold_disease");
    }
  });

  it("spreads to the others in the room at a cycle change", () => {
    const state = createGame(makeSeats(4), config, 1);
    const stats = state.config.diseases.allDiseaseStats[0];
    if (stats) state.config.diseases.allDiseaseStats[0] = { ...stats, cycleSpread: 1 };
    const [sick, near, far] = [player(state, "p0"), player(state, "p1"), player(state, "p2")];
    addDisease(state, sick, "cold_disease");
    sick.room = near.room = "FRONT_CORRIDOR";
    far.room = "BRIDGE";
    cycleChanged(state);
    expect(near.modifiers).toContain("cold_disease");
    expect(far.modifiers).not.toContain("cold_disease");
  });

  it("lets a Mush spread it at a cycle change without losing anything", () => {
    const state = createGame(makeSeats(4), config, 1);
    const stats = state.config.diseases.allDiseaseStats[0];
    if (stats) state.config.diseases.allDiseaseStats[0] = { ...stats, cycleSpread: 1 };
    const mush = state.players.find((p) => p.role === "mush")!;
    const other = state.players.find((p) => p.role === "human")!;
    addDisease(state, mush, "cold_disease");
    mush.room = other.room = "FRONT_CORRIDOR";
    mush.mp = 5;
    for (let i = 0; i < 20; i++) cycleChanged(state);
    expect(other.modifiers).toContain("cold_disease");
    expect(mush.mp).toBe(5);
  });
});
