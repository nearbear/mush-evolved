import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease } from "../src/diseases.ts";
import { contaminate } from "../src/infection.ts";
import { createGame } from "../src/rules.ts";
import { MUSH_CHANNEL, type GameState } from "../src/types.ts";
import { makeSeats, mustApply, player } from "./support.ts";

function ship(seed = 1): GameState {
  const state = createGame(makeSeats(4), { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [] }, seed, { p0: "mush" });
  const p0 = player(state, "p0");
  for (const p of state.players) p.room = p0.room;
  return state;
}

describe("Hygienist (strong_skin)", () => {
  it("pins the default resist odds at 50%", () => {
    expect(DEFAULT_CONFIG.strongSkin.resistOdds).toBe(0.5);
  });

  it("gives a human a 50% chance to resist Mush contamination silently", () => {
    let resisted = 0;
    let infected = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const state = ship(seed);
      const p2 = player(state, "p2");
      p2.skills.push("strong_skin");
      const chatBefore = state.chat.filter((m) => m.channel === MUSH_CHANNEL).length;
      contaminate(state, p2);
      const chatAfter = state.chat.filter((m) => m.channel === MUSH_CHANNEL).length;
      if ((state.contamination.p2 ?? 0) === 0) {
        resisted++;
        expect(chatAfter).toBe(chatBefore);
      } else {
        infected++;
        expect(state.contamination.p2).toBe(1);
        expect(chatAfter).toBe(chatBefore + 1);
      }
    }
    expect(resisted).toBeGreaterThan(25);
    expect(infected).toBeGreaterThan(25);
  });

  it("works from the book slot too", () => {
    let resisted = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const state = ship(seed);
      const p2 = player(state, "p2");
      p2.bookSkill = "strong_skin";
      contaminate(state, p2);
      if ((state.contamination.p2 ?? 0) === 0) resisted++;
    }
    expect(resisted).toBeGreaterThan(5);
    expect(resisted).toBeLessThan(35);
  });

  it("rolls once for all spores in fungal cuisine (all or nothing)", () => {
    let resistedAll = 0;
    let tookAll = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const state = ship(seed);
      const p2 = player(state, "p2");
      p2.skills.push("strong_skin");
      state.items.push({ id: "i-banana", type: "fruit_banana", at: { kind: "room", id: p2.room }, spores: 2 });
      const next = mustApply(state, "p2", { type: "consume", item: "i-banana" });
      const level = next.contamination.p2 ?? 0;
      expect([0, 2]).toContain(level);
      if (level === 0) resistedAll++;
      else tookAll++;
    }
    expect(resistedAll).toBeGreaterThan(10);
    expect(tookAll).toBeGreaterThan(10);
  });

  it("gives a human a 50% chance to resist physical diseases", () => {
    let resisted = 0;
    let caught = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const state = ship(seed);
      const p2 = player(state, "p2");
      p2.skills.push("strong_skin");
      addDisease(state, p2, "cold_disease");
      if (p2.modifiers.includes("cold_disease")) caught++;
      else resisted++;
    }
    expect(resisted).toBeGreaterThan(25);
    expect(caught).toBeGreaterThan(25);
  });

  it("does not resist injuries, disorders, or diseases on a Mush", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = ship(seed);
      const p0 = player(state, "p0"); // Mush
      const p2 = player(state, "p2"); // Human
      p0.skills.push("strong_skin");
      p2.skills.push("strong_skin");
      addDisease(state, p0, "cold_disease");
      addDisease(state, p2, "broken_nose_injury");
      addDisease(state, p2, "depression_disorder");
      expect(p0.modifiers).toContain("cold_disease");
      expect(p2.modifiers).toContain("broken_nose_injury");
      expect(p2.modifiers).toContain("depression_disorder");
    }
  });
});
