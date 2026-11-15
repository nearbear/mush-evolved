import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease, blurredVision, diseaseStats } from "../src/diseases.ts";
import { actionSuccessRate } from "../src/modifiers.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState, PlayerState } from "../src/types.ts";
import type { ActionTag } from "../src/actions/action.ts";
import { makeSeats, noHunters, option, player } from "./support.ts";

const config: GameConfig = { ...DEFAULT_CONFIG, mushCount: 1, preselection: null, startSkills: [], startInventory: [], startItems: [] };

const TURRET_ROOM = "LASER_TURRET_A_0";

function ship(): GameState {
  const s = createGame(makeSeats(3), noHunters({ ...DEFAULT_CONFIG, mushCount: 1, startItems: [] }), 3);
  player(s, "p0").room = TURRET_ROOM;
  s.hunters.list.push({ id: "h1", hp: 100, hitChance: s.config.hunters.types.hunter.hitChance, target: null, type: "hunter", countdown: null });
  return s;
}

const rate = (state: GameState, actor: PlayerState, action: Action, tags: ActionTag[] = []) => actionSuccessRate(0.6, { state, actor, action, tags });

describe("Pink Eye", () => {
  it("lasts 8 to 12 cycles", () => {
    const state = createGame(makeSeats(4), noHunters(config), 3);
    expect(diseaseStats(state, "pink_eye_disease")).toMatchObject({ durationMin: 8, durationMax: 12 });
  });

  it("takes a quarter off a turret shot", () => {
    const s = ship();
    const base = option(s, "p0", { type: "turret_attack" })!.chance;
    addDisease(s, player(s, "p0"), "pink_eye_disease");
    expect(option(s, "p0", { type: "turret_attack" })!.chance).toBeCloseTo(base * 0.75);
  });

  it("takes a quarter off a patrol shot and a gun, not a melee blow or anything else", () => {
    const state = createGame(makeSeats(4), noHunters(config), 3);
    const human = state.players.find((p) => p.role === "human")!;
    addDisease(state, human, "pink_eye_disease");
    expect(rate(state, human, { type: "patrol_attack", equipment: "x", hunter: "h" } as Action)).toBeCloseTo(0.45);
    expect(rate(state, human, { type: "attack", weapon: "w", target: "t" } as Action, ["aggressive"])).toBeCloseTo(0.45);
    expect(rate(state, human, { type: "attack", weapon: "w", target: "t" } as Action, ["aggressive", "melee"])).toBeCloseTo(0.6);
    expect(rate(state, human, { type: "repair" } as unknown as Action)).toBeCloseTo(0.6);
  });

  it("costs a Mush nothing, shots or sight", () => {
    const state = createGame(makeSeats(4), noHunters(config), 3);
    const mush = state.players.find((p) => p.role === "mush")!;
    addDisease(state, mush, "pink_eye_disease");
    expect(rate(state, mush, { type: "patrol_attack", equipment: "x", hunter: "h" } as Action)).toBeCloseTo(0.6);
    expect(blurredVision(viewFor(state, mush.id))).toBe(false);
  });

  it("blurs only its holder's view", () => {
    const state = createGame(makeSeats(4), noHunters(config), 3);
    const [sick, well] = state.players.filter((p) => p.role === "human");
    expect(blurredVision(viewFor(state, sick!.id))).toBe(false);
    addDisease(state, sick!, "pink_eye_disease");
    expect(blurredVision(viewFor(state, sick!.id))).toBe(true);
    expect(blurredVision(viewFor(state, well!.id))).toBe(false);
  });
});
