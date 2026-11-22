import { describe, expect, it } from "vitest";
import { convert, cure } from "../src/infection.ts";
import { RESEARCH_COMPLETE } from "../src/research.ts";
import { applyAction, createGame, legalActions, viewFor } from "../src/rules.ts";
import { MUSH_SKILL_SLOTS, PICKABLE_MUSH_SKILLS, hasSkill, skillsOf } from "../src/skills.ts";
import type { GameState } from "../src/types.ts";
import { costOf, makeSeats, must, nextDay, player, testConfig } from "./support.ts";

// Fertile (innate Mush skill): every Mush gets one free spore extraction a day without using a skill slot (owner, 2026-10-27, 2026-11-11, 2026-11-21).
const config = testConfig({ manualCycles: true });
const extract = { type: "extract_spore" } as const;

function ship(): GameState {
  const s = createGame(makeSeats(3), config, 3);
  s.preselection = false;
  s.players.forEach((p, i) => {
    p.role = i === 0 ? "mush" : "human";
    p.mushSkills = [];
    p.ap = 5;
  });
  return s;
}

describe("fertile", () => {
  it("is innate for every Mush without taking a Mush skill slot or appearing in the picker", () => {
    let s = ship();
    const p0 = player(s, "p0");
    expect(hasSkill(p0, "fertile")).toBe(true);
    expect(skillsOf(p0)).toContain("fertile");
    expect(p0.mushSkills).toEqual([]);
    expect(viewFor(s, "p0").you.mushSkills).toEqual([]);
    expect(hasSkill(player(s, "p1"), "fertile")).toBe(false);
    expect(skillsOf(player(s, "p1"))).not.toContain("fertile");

    expect(legalActions(s, "p0")).not.toContainEqual({ type: "pick_skill", skill: "fertile" });
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", { type: "pick_skill", skill: "fertile" }).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);

    // Still gets all 4 pickable Mush skill slots on top of Fertile.
    for (const skill of PICKABLE_MUSH_SKILLS.slice(0, MUSH_SKILL_SLOTS)) {
      s = must(applyAction(s, "p0", { type: "pick_skill", skill }));
    }
    expect(player(s, "p0").mushSkills).toHaveLength(MUSH_SKILL_SLOTS);
    expect(hasSkill(player(s, "p0"), "fertile")).toBe(true);
  });

  it("makes the first extraction of the day free, then the normal price", () => {
    const s = ship();
    expect(costOf(s, "p0", extract).ap).toBe(0);
    const once = must(applyAction(s, "p0", extract));
    expect(player(once, "p0").ap).toBe(5);
    expect(player(once, "p0").spores).toBe(config.spores.effect.spores);
    expect(once.sporesToday).toBe(config.spores.effect.spores);
    expect(costOf(once, "p0", extract).ap).toBe(config.spores.cost.ap);
  });

  it("is blocked by the faction's daily cap", () => {
    const s = ship();
    s.sporesToday = config.spores.perDay;
    expect(applyAction(s, "p0", extract).ok).toBe(false);
  });

  it("comes back the next day", () => {
    const used = must(applyAction(ship(), "p0", extract));
    const next = nextDay(used);
    expect(costOf(next, "p0", extract).ap).toBe(0);
  });

  it("applies to converted Mush and is lost when cured", () => {
    const s = ship();
    convert(s, player(s, "p1"));
    expect(hasSkill(player(s, "p1"), "fertile")).toBe(true);
    expect(player(s, "p1").mushSkills).toEqual([]);
    expect(costOf(s, "p1", extract).ap).toBe(0);

    cure(s, player(s, "p1"));
    expect(hasSkill(player(s, "p1"), "fertile")).toBe(false);
  });

  it("stays active after Epigenetics resets Mush skills", () => {
    const s = ship();
    player(s, "p0").mushSkills = ["epigenetics", "ninja"];
    const after = must(applyAction(s, "p0", { type: "reset_skills" }));
    expect(player(after, "p0").mushSkills).toEqual(["epigenetics"]);
    expect(hasSkill(player(after, "p0"), "fertile")).toBe(true);
    expect(costOf(after, "p0", extract).ap).toBe(0);
  });

  it("stays free on the first extraction even when CONSTIPASPORE_SERUM is complete", () => {
    const s = ship();
    s.research.CONSTIPASPORE_SERUM = RESEARCH_COMPLETE;
    expect(costOf(s, "p0", extract).ap).toBe(0);
    const once = must(applyAction(s, "p0", extract));
    expect(player(once, "p0").ap).toBe(5);
    expect(costOf(once, "p0", extract).ap).toBe(config.spores.cost.ap + config.spores.constipasporeExtraAp);
  });

  it("never leaks fertileToday to other players", () => {
    const used = must(applyAction(ship(), "p0", extract));
    expect(player(used, "p0").fertileToday).toBe(true);
    for (const id of ["p1", "p2"]) {
      expect(JSON.stringify(viewFor(used, id))).not.toContain("fertileToday");
    }
  });
});
