import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { applyAction, createGame } from "../src/rules.ts";
import { addStatus } from "../src/statuses.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, player } from "./support.ts";

const config = { ...DEFAULT_CONFIG, characterModifiers: {}, mushCount: 1, startInventory: [], startItems: [], maxAp: 99, startAp: 10 };
const shower: Action = { type: "shower", equipment: "BEDROOM_A:SHOWER" };

function ship(role: "mush" | "human", skills: string[]): GameState {
  const s = createGame(makeSeats(4), config, 3);
  s.players.forEach((p, i) => {
    p.role = i === 0 ? "mush" : "human";
    p.room = "BEDROOM_A";
  });
  const p = player(s, "p1");
  p.role = role;
  p.skills = skills;
  addStatus(p, "dirty");
  return s;
}

function run(s: GameState) {
  const before = player(s, "p1");
  const [ap, hp] = [before.ap, before.hp];
  const r = applyAction(s, "p1", shower);
  if (!r.ok) throw new Error(r.error);
  const after = player(r.state, "p1");
  return { spentAp: ap - after.ap, lostHp: hp - after.hp };
}

describe("Water Resistant", () => {
  it("a Mush without it pays full AP and loses HP", () => {
    const r = run(ship("mush", []));
    expect(r.spentAp).toBe(config.shower.cost.ap);
    expect(r.lostHp).toBe(config.shower.effect.mushDamage);
  });
  it("a Mush with it pays 1 AP and loses no HP", () => {
    const r = run(ship("mush", ["water_resistant"]));
    expect(r.spentAp).toBe(config.shower.cost.waterResistantAp);
    expect(r.lostHp).toBe(0);
  });
  it("does not stack with soap", () => {
    const s = ship("mush", ["water_resistant"]);
    s.items.push({ id: "soap-1", type: "soap", at: { kind: "player", id: "p1" } });
    expect(run(s).spentAp).toBe(config.shower.cost.waterResistantAp);
  });
});
