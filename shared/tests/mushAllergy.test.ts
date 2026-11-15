import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease, diseaseStats } from "../src/diseases.ts";
import { contaminate } from "../src/infection.ts";
import { contaminationCapacity } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { GameConfig } from "../src/types.ts";
import { makeSeats, noHunters } from "./support.ts";

const config: GameConfig = { ...DEFAULT_CONFIG, mushCount: 1, preselection: null, startSkills: [], startInventory: [], startItems: [] };

const setup = () => {
  const state = createGame(makeSeats(4), noHunters(config), 3);
  const human = state.players.find((p) => p.role === "human" && !p.modifiers.includes("immunity"))!;
  addDisease(state, human, "mush_allergy_disease");
  return { state, human };
};

describe("Mush Allergy", () => {
  it("lasts 20 to 32 cycles", () => {
    const { state, human } = setup();
    expect(diseaseStats(state, "mush_allergy_disease")).toMatchObject({ durationMin: 20, durationMax: 32 });
    const duration = human.diseaseTrackers.find((t) => t.name === "mush_allergy_disease")!.duration;
    expect(duration).toBeGreaterThanOrEqual(20);
    expect(duration).toBeLessThanOrEqual(32);
  });

  it("kills a human who receives a spore, as an injury", () => {
    const { state, human } = setup();
    contaminate(state, human, 1);
    expect(human.alive).toBe(false);
    expect(human.role).toBe("human");
  });

  it("spares someone the spore converts", () => {
    const { state, human } = setup();
    contaminate(state, human, contaminationCapacity(state, human));
    expect(human.role).toBe("mush");
    expect(human.alive).toBe(true);
  });

  it("does nothing to a Mush carrier", () => {
    const state = createGame(makeSeats(4), noHunters(config), 3);
    const mush = state.players.find((p) => p.role === "mush")!;
    addDisease(state, mush, "mush_allergy_disease");
    contaminate(state, mush, 1);
    expect(mush.alive).toBe(true);
  });
});
