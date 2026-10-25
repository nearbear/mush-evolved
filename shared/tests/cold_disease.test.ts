import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease } from "../src/adjustStats.ts";
import { cycleChanged } from "../src/modifiers.ts";
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
};

describe("Cold disease", () => {
  it("advances the cycle after a disease tracker is created", () => {
    const state = createGame(makeSeats(4), noHunters(config), 0);
    const sick = player(state, "p0");
    addDisease(state, sick, "cold_disease");

    const next = must(newCycle(state));

    expect(player(next, "p0").diseaseTrackers).toMatchObject([{ name: "cold_disease", duration: 7 }]);
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
});
