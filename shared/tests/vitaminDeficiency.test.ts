import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease, diseaseStats } from "../src/diseases.ts";
import { actionFailed, actionSuccessRate } from "../src/modifiers.ts";
import { createGame } from "../src/rules.ts";
import type { Action, GameConfig, GameState, PlayerState } from "../src/types.ts";
import { makeSeats, noHunters } from "./support.ts";

const config: GameConfig = { ...DEFAULT_CONFIG, mushCount: 1, preselection: null, startSkills: [], startInventory: [], startItems: [] };

const game = (): GameState => createGame(makeSeats(4), noHunters(config), 3);
const human = (s: GameState) => s.players.find((p) => p.role === "human")!;
const mush = (s: GameState) => s.players.find((p) => p.role === "mush")!;
const rate = (state: GameState, actor: PlayerState) =>
  actionSuccessRate(0.6, { state, actor, action: { type: "repair" } as unknown as Action, tags: [] });

/** How many of `tries` failed actions log weakness. */
function weakLogs(s: GameState, p: PlayerState, tries: number): number {
  for (let i = 0; i < tries; i++) actionFailed(s, p, 1);
  return s.log.filter((e) => e.key === "weakness").length;
}

describe("Vitamin Deficiency", () => {
  it("lasts 12 to 20 cycles", () => {
    expect(diseaseStats(game(), "vitamin_deficiency_disease")).toMatchObject({ durationMin: 12, durationMax: 20 });
  });

  it("takes 15% off any action's success chance, relative", () => {
    const s = game();
    const p = human(s);
    addDisease(s, p, "vitamin_deficiency_disease");
    expect(rate(s, p)).toBeCloseTo(0.6 * 0.85);
  });

  it("leaves a sure action sure", () => {
    const s = game();
    const p = human(s);
    addDisease(s, p, "vitamin_deficiency_disease");
    expect(actionSuccessRate(1, { state: s, actor: p, action: { type: "repair" } as unknown as Action, tags: [] })).toBe(1);
  });

  it("sometimes, not always, logs weakness in the room after a failed action", () => {
    const s = game();
    const p = human(s);
    addDisease(s, p, "vitamin_deficiency_disease");
    const tries = 400;
    const logs = weakLogs(s, p, tries);
    expect(logs).toBeGreaterThan(tries * 0.15);
    expect(logs).toBeLessThan(tries * 0.35);
    expect(s.log.filter((e) => e.key === "weakness").every((e) => e.room === p.room)).toBe(true);
  });

  it("costs a Mush nothing", () => {
    const s = game();
    const m = mush(s);
    addDisease(s, m, "vitamin_deficiency_disease");
    expect(rate(s, m)).toBeCloseTo(0.6);
    expect(weakLogs(s, m, 50)).toBe(0);
  });
});
