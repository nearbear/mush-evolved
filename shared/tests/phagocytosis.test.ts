import { describe, expect, it } from "vitest";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { costOf, makeSeats, must, player, testConfig } from "./support.ts";

// Phagocytosis (Mush skill): consume_spore costs 1 spore and no AP, heals 4 HP and gives 4 AP (owner, 2026-11-04).
const config = testConfig({ manualCycles: true });
const eat = { type: "consume_spore" } as const;

function ship(skill = true): GameState {
  const s = createGame(makeSeats(3), config, 3);
  s.preselection = false;
  s.players.forEach((p, i) => {
    p.role = i === 0 ? "mush" : "human";
    p.mushSkills = i === 0 && skill ? ["phagocytosis"] : [];
  });
  const mush = player(s, "p0");
  mush.spores = 2;
  mush.hp = 5;
  mush.maxHp = 14;
  mush.ap = 3;
  mush.maxAp = 12;
  for (const p of s.players.slice(1)) p.room = mush.room === "LABORATORY" ? "REFECTORY" : "LABORATORY";
  return s;
}

describe("phagocytosis", () => {
  it("costs 1 spore and no AP, healing and giving AP", () => {
    const s = ship();
    expect(costOf(s, "p0", eat).ap).toBe(config.consumeSpore.cost.ap);
    const r = must(applyAction(s, "p0", eat));
    const p = player(r, "p0");
    expect(p.spores).toBe(1);
    expect(p.hp).toBe(5 + config.consumeSpore.effect.hp);
    expect(p.ap).toBe(3 + config.consumeSpore.effect.ap);
  });

  it("caps HP and AP at their maxima", () => {
    const s = ship();
    Object.assign(player(s, "p0"), { hp: 13, ap: 11 });
    const p = player(must(applyAction(s, "p0", eat)), "p0");
    expect([p.hp, p.ap]).toEqual([14, 12]);
  });

  it("logs the same secret line as consume, seen only by the actor when alone", () => {
    const r = must(applyAction(ship(), "p0", eat));
    expect(viewFor(r, "p0").log.at(-1)).toMatchObject({ key: "consumed" });
    expect(viewFor(r, "p1").log.some((e) => e.key === "consumed")).toBe(false);
  });

  it("is refused without the skill, without a spore, for a human, or in pre-selection, and leaves state unchanged", () => {
    const noSkill = ship(false);
    const noSpore = ship();
    player(noSpore, "p0").spores = 0;
    const human = ship();
    player(human, "p1").mushSkills = ["phagocytosis"];
    const pre = ship();
    pre.preselection = true;
    for (const [s, id] of [[noSkill, "p0"], [noSpore, "p0"], [human, "p1"], [pre, "p0"]] as const) {
      const before = JSON.stringify(s);
      expect(applyAction(s, id, eat).ok).toBe(false);
      expect(JSON.stringify(s)).toBe(before);
    }
  });
});
