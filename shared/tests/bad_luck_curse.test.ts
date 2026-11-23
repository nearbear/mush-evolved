import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { CAMERA_EQUIPMENT } from "../src/equipment.ts";
import { diseaseStats } from "../src/diseases.ts";
import { incidentDamage } from "../src/incidents.ts";
import { actionDirtRate, actionInjuryRate, modifierIds } from "../src/modifiers.ts";
import { applyAction, createGame, legalActions, viewFor } from "../src/rules.ts";
import { SKILL_STATUS } from "../src/skills.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, player, testConfig } from "./support.ts";

const CURSE = "bad_luck_curse";

/** p0 and p1 Mush (p0 with Nightmarish), p2 and p3 humans, all on the bridge with no modifiers. */
const ship = (): GameState => {
  const s = createGame(makeSeats(4), testConfig({ mushCount: 2 }), 5, { p0: "mush", p1: "mush" });
  player(s, "p0").mushSkills.push("nightmare");
  player(s, "p0").ap = 6;
  for (const p of s.players) Object.assign(p, { room: "BRIDGE", modifiers: [], skills: [] });
  return s;
};
const curse = (s: GameState, target = "p2") => mustApply(s, "p0", { type: "nightmare", target });
const targets = (s: GameState, id: string) => legalActions(s, id).filter((a) => a.type === "nightmare").map((a) => a.target);
const tracker = (s: GameState, id: string) => player(s, id).diseaseTrackers.find((t) => t.name === CURSE);
const punch: Action = { type: "punch", target: "p3" };

describe("Bad Luck (bad_luck_curse) and Nightmarish (nightmare)", () => {
  it("pins the owner's numbers: 2 AP, x4 injury and dirt, 8-16 cycles, and the skill is built", () => {
    expect(DEFAULT_CONFIG.nightmare.cost.ap).toBe(2);
    expect([DEFAULT_CONFIG.badLuckCurse.injuryFactor, DEFAULT_CONFIG.badLuckCurse.dirtFactor]).toEqual([4, 4]);
    expect(diseaseStats(ship(), CURSE)).toMatchObject({ durationMin: 8, durationMax: 16 });
    expect(SKILL_STATUS.nightmare).toBe("full");
  });

  it("is offered only on living human roommates and curses for the AP", () => {
    const s = ship();
    expect(targets(s, "p0").sort()).toEqual(["p2", "p3"]);
    const next = curse(s);
    expect(player(next, "p0").ap).toBe(6 - DEFAULT_CONFIG.nightmare.cost.ap);
    expect(player(next, "p2").modifiers).toContain(CURSE);
    const { durationMin, durationMax } = diseaseStats(next, CURSE)!;
    expect(tracker(next, "p2")!.duration).toBeGreaterThanOrEqual(durationMin!);
    expect(tracker(next, "p2")!.duration).toBeLessThanOrEqual(durationMax!);
  });

  it("cursing again rerolls the duration instead of stacking", () => {
    const s = curse(ship());
    tracker(s, "p2")!.duration = 1;
    const again = curse(s);
    expect(player(again, "p2").diseaseTrackers.filter((t) => t.name === CURSE)).toHaveLength(1);
    expect(tracker(again, "p2")!.duration).toBeGreaterThanOrEqual(diseaseStats(again, CURSE)!.durationMin!);
  });

  it("ends when its countdown runs out", () => {
    let s = curse(ship());
    tracker(s, "p2")!.duration = 1;
    s = nextCycle(s);
    expect(player(s, "p2").modifiers).not.toContain(CURSE);
    expect(player(s, "p2").statuses).not.toContain(CURSE);
  });

  it("rejects a human, a Mush without the skill, pre-selection, a Mush target, and someone elsewhere or dead; state unchanged", () => {
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
    for (const target of ["p0", "p1", "p2", "p3", "nobody"]) expect(applyAction(s, "p0", { type: "nightmare", target }).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("multiplies the holder's action injury and dirt chances, and does nothing to a Mush", () => {
    const s = curse(ship());
    const ctx = { state: s, actor: player(s, "p2"), action: punch, tags: [] };
    const { injuryFactor, dirtFactor } = s.config.badLuckCurse;
    expect(actionInjuryRate(0.05, ctx)).toBeCloseTo(0.05 * injuryFactor);
    expect(actionDirtRate(0.05, ctx)).toBeCloseTo(0.05 * dirtFactor);
    const mush = player(s, "p1");
    mush.modifiers.push(CURSE);
    expect(modifierIds(mush)).not.toContain(CURSE);
    expect(actionInjuryRate(0.05, { ...ctx, actor: mush })).toBeCloseTo(0.05);
  });

  it("takes the top of an incident's damage range (Metal Plate, Tremor)", () => {
    const s = curse(ship());
    const { metalPlate, tremor } = s.config.incidents;
    expect(incidentDamage(s, player(s, "p2"), metalPlate.damage)).toBe(metalPlate.damage[1]);
    expect(incidentDamage(s, player(s, "p2"), tremor.damage)).toBe(tremor.damage[1]);
    const rng = JSON.stringify(s.rng);
    incidentDamage(s, player(s, "p2"), tremor.damage);
    expect(JSON.stringify(s.rng)).toBe(rng);
  });

  it("is covert: the victim and bystanders see nothing, a camera shows the room", () => {
    expect([ACTIONS.nightmare.visibility, ACTIONS.nightmare.tags]).toEqual(["covert", ["aggressive", "mush"]]);
    const next = curse(ship());
    const has = (s: GameState, id: string) => viewFor(s, id).log.some((e) => e.key === "cursedBadLuck");
    expect([has(next, "p0"), has(next, "p2"), has(next, "p3")]).toEqual([true, false, false]);
    const cam = ship();
    cam.equipment["BRIDGE"] = [{ id: "cam1", type: CAMERA_EQUIPMENT, broken: false }];
    expect(has(curse(cam), "p3")).toBe(true);
  });

  it("hides the curse from its holder entirely: statuses, modifiers, trackers and action odds", () => {
    const s = ship();
    const cursed = curse(s);
    const view = viewFor(cursed, "p2");
    expect(JSON.stringify(view)).not.toContain(CURSE);
    // The odds shown are the ones they'd have uncursed.
    const odds = (st: GameState) => viewFor(st, "p2").actions.map((o) => [o.dirt, o.injury]);
    expect(odds(s).flat().some((x) => x > 0)).toBe(true);
    expect(odds(cursed)).toEqual(odds(s));
  });

  it("shows the curse only to Mush in the holder's room, as a status", () => {
    const s = curse(ship());
    const seen = (viewer: string) => viewFor(s, viewer).players.find((o) => o.id === "p2")!.statuses;
    expect(seen("p0")).toContain(CURSE);
    expect(seen("p1")).toContain(CURSE);
    expect(seen("p3")).not.toContain(CURSE);
    expect(JSON.stringify(viewFor(s, "p3"))).not.toContain(CURSE);
    player(s, "p1").room = "LABORATORY";
    expect(JSON.stringify(viewFor(s, "p1"))).not.toContain(CURSE);
  });
});
