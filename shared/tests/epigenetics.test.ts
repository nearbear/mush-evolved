import { describe, expect, it } from "vitest";
import { applyAction, createGame, legalActions } from "../src/rules.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { makeSeats, mustApply, player } from "./support.ts";

const ship = () => {
  const s = createGame(makeSeats(4), { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [] }, 5, { p0: "mush" });
  const p = player(s, "p0");
  p.mushSkills.push("epigenetics", "fertile", "ninja");
  p.ap = 5;
  return s;
};
const offered = (s: ReturnType<typeof ship>, id: string) => legalActions(s, id).some((a) => a.type === "reset_skills");

describe("Epigenetics", () => {
  it("costs 2 AP, drops the other Mush skills once and keeps human skills", () => {
    expect(DEFAULT_CONFIG.resetSkills.cost.ap).toBe(2);
    const s = ship();
    player(s, "p0").skills.push("pilot");
    expect(offered(s, "p0")).toBe(true);
    const next = mustApply(s, "p0", { type: "reset_skills" });
    expect([player(next, "p0").mushSkills, player(next, "p0").skills, player(next, "p0").ap]).toEqual([["epigenetics"], ["pilot"], 3]);
    expect(offered(next, "p0")).toBe(false);
    expect(applyAction(next, "p0", { type: "reset_skills" }).ok).toBe(false);
  });

  it("is only for a Mush holding the skill", () => {
    const s = ship();
    player(s, "p0").mushSkills = ["fertile"];
    expect(offered(s, "p0")).toBe(false);
    const h = ship();
    player(h, "p0").role = "human";
    expect(offered(h, "p0")).toBe(false);
    expect(applyAction(h, "p0", { type: "reset_skills" }).ok).toBe(false);
  });
});
