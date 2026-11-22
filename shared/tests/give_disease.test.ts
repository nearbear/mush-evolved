import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { CAMERA_EQUIPMENT } from "../src/equipment.ts";
import { applyAction, createGame, legalActions, viewFor } from "../src/rules.ts";
import { SKILL_STATUS } from "../src/skills.ts";
import type { GameState } from "../src/types.ts";
import { makeSeats, mustApply, player, testConfig } from "./support.ts";

const list = DEFAULT_CONFIG.diseases.mushSkillDiseases;

/** p0 and p1 Mush (p0 with Bacteriophilia), p2 and p3 humans, all on the bridge with no diseases. */
const ship = (): GameState => {
  const s = createGame(makeSeats(4), testConfig({ mushCount: 2 }), 5, { p0: "mush", p1: "mush" });
  const p0 = player(s, "p0");
  p0.mushSkills.push("bacterial_contact");
  p0.ap = 6;
  for (const p of s.players) Object.assign(p, { room: "BRIDGE", modifiers: [], skills: [] });
  return s;
};
const targets = (s: GameState, id: string) => legalActions(s, id).filter((a) => a.type === "give_disease").map((a) => a.target);
const caught = (s: GameState, id: string) => player(s, id).modifiers.filter((m) => list.includes(m));

describe("Bacteriophilia (give_disease)", () => {
  it("pins the owner's numbers: 1 AP, the owner's list, and the skill is built", () => {
    expect(DEFAULT_CONFIG.giveDisease.cost.ap).toBe(1);
    expect(list).toEqual(["space_rabies_disease", "fungal_infection_disease", "cold_disease", "extreme_tinnitus_disease"]);
    for (const d of list) expect(DEFAULT_CONFIG.diseases.allDiseases).toContain(d);
    expect(SKILL_STATUS.bacterial_contact).toBe("full");
  });

  it("is offered on self and every living roommate, human or Mush, and gives one disease from the list for 1 AP", () => {
    const s = ship();
    expect(targets(s, "p0").sort()).toEqual(["p0", "p1", "p2", "p3"]);
    const next = mustApply(s, "p0", { type: "give_disease", target: "p2" });
    expect(player(next, "p0").ap).toBe(6 - DEFAULT_CONFIG.giveDisease.cost.ap);
    expect(caught(next, "p2")).toHaveLength(1);
    const self = mustApply(s, "p0", { type: "give_disease", target: "p0" });
    expect(caught(self, "p0")).toHaveLength(1);
  });

  it("picks one the target lacks, and is still offered (and spends AP) when they have the whole list", () => {
    const s = ship();
    player(s, "p2").modifiers.push(...list.slice(1));
    const next = mustApply(s, "p0", { type: "give_disease", target: "p2" });
    expect(caught(next, "p2").sort()).toEqual([...list].sort());
    expect(targets(next, "p0")).toContain("p2");
    const again = mustApply(next, "p0", { type: "give_disease", target: "p2" });
    expect(player(again, "p0").ap).toBe(6 - 2 * DEFAULT_CONFIG.giveDisease.cost.ap);
    expect(player(again, "p2").modifiers).toEqual(player(next, "p2").modifiers);
  });

  it("rejects a human, a Mush without the skill, pre-selection, and someone elsewhere or dead; state unchanged", () => {
    const human = ship();
    player(human, "p0").role = "human";
    expect(targets(human, "p0")).toEqual([]);
    const noSkill = ship();
    player(noSkill, "p0").mushSkills = [];
    expect(targets(noSkill, "p0")).toEqual([]);
    const pre = ship();
    pre.preselection = { endsAt: 1000, seats: 4, picks: {} };
    expect(targets(pre, "p0")).toEqual([]);
    const s = ship();
    player(s, "p2").room = "LABORATORY";
    player(s, "p3").alive = false;
    const before = JSON.stringify(s);
    for (const target of ["p2", "p3", "nobody"]) expect(applyAction(s, "p0", { type: "give_disease", target }).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("is covert: the victim and bystanders see nothing, a camera shows the room; the disease isn't named", () => {
    expect([ACTIONS.give_disease.visibility, ACTIONS.give_disease.tags]).toEqual(["covert", ["aggressive", "mush"]]);
    const next = mustApply(ship(), "p0", { type: "give_disease", target: "p2" });
    const has = (id: string) => viewFor(next, id).log.some((e) => e.key === "gaveDisease");
    expect([has("p0"), has("p2"), has("p3")]).toEqual([true, false, false]);
    const entry = viewFor(next, "p0").log.find((e) => e.key === "gaveDisease");
    for (const d of list) expect(JSON.stringify(entry)).not.toContain(d);
    const cam = ship();
    cam.equipment["BRIDGE"] = [{ id: "cam1", type: CAMERA_EQUIPMENT, broken: false }];
    const seen = mustApply(cam, "p0", { type: "give_disease", target: "p2" });
    expect(viewFor(seen, "p3").log.some((e) => e.key === "gaveDisease")).toBe(true);
  });

  it("Black Bite makes it free on a carrier", () => {
    const s = ship();
    player(s, "p2").modifiers.push("black_bite_disease");
    const option = viewFor(s, "p0").actions.find((o) => o.action.type === "give_disease" && "target" in o.action && o.action.target === "p2");
    expect(option?.cost.ap).toBe(0);
  });
});
