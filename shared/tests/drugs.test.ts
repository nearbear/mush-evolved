import { describe, expect, it } from "vitest";
import { createGame, viewFor } from "../src/rules.ts";
import { makeSeats } from "./support.ts";
import { drawDrugs, MAX_TREATED } from "../src/drugs.ts";
import { DRUG_ITEMS } from "../src/items.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";

describe("drawDrugs", () => {
  it("draws 12 drugs, each treating 1-4 diseases, and every disease is treated", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const diseases = Array.from({ length: 12 * MAX_TREATED }, (_, i) => `d${i}`);
      const config = { diseases: { ...DEFAULT_CONFIG.diseases, allDiseases: diseases } };
      for (const diseaseList of [DEFAULT_CONFIG.diseases.allDiseases, diseases]) {
        const drugs = drawDrugs({ rng: seed, config: { diseases: { ...config.diseases, allDiseases: diseaseList } } });
        expect(Object.keys(drugs)).toEqual([...DRUG_ITEMS]);
        for (const d of Object.values(drugs)) {
          expect(d.treats.length).toBeGreaterThanOrEqual(1);
          expect(d.treats.length).toBeLessThanOrEqual(MAX_TREATED);
          expect(new Set(d.treats).size).toBe(d.treats.length);
          expect([0, -2, 1, 2, 3]).toContain(d.morale);
          expect(d.ap === 0 || d.mp === 0).toBe(true);
        }
        expect(new Set(Object.values(drugs).flatMap((d) => d.treats))).toEqual(new Set(diseaseList));
      }
    }
  });
});

describe("the Medlab's stock", () => {
  it("starts with 12 drugs in the Medlab", () => {
    const state = createGame(makeSeats(3), DEFAULT_CONFIG, 7);
    const drugs = state.items.filter((i) => DRUG_ITEMS.includes(i.type));
    expect(drugs).toHaveLength(12);
    expect(drugs.every((i) => i.at.kind === "room" && i.at.id === "SICK_BAY")).toBe(true);
  });
});

describe("who sees the drugs' effects", () => {
  it("only living Biologists, Medics, Nurses and Mush", () => {
    const state = createGame(makeSeats(4), DEFAULT_CONFIG, 3);
    const [a, b, c, d] = state.players;
    for (const p of state.players) p.role = "human";
    a!.skills.push("biologist");
    b!.skills.push("medic");
    c!.skills.push("first_aid");
    d!.role = "mush";
    for (const p of state.players) expect(viewFor(state, p.id).drugEffects).toEqual(state.drugs);
    d!.role = "human";
    d!.skills.push("skilful");
    expect(viewFor(state, d!.id).drugEffects).toEqual(state.drugs);
    d!.skills.pop();
    d!.role = "mush";
    d!.role = "human";
    expect(viewFor(state, d!.id).drugEffects).toBeNull();
    a!.alive = false;
    expect(viewFor(state, a!.id).drugEffects).toBeNull();
  });
  it("is never in another player's view", () => {
    const state = createGame(makeSeats(3), DEFAULT_CONFIG, 3);
    for (const p of state.players) p.role = "human";
    state.players[0]!.skills.push("medic");
    expect(JSON.stringify(viewFor(state, state.players[1]!.id))).not.toContain('"treats"');
  });
});
