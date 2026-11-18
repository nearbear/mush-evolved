import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { addDisease } from "../src/diseases.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState, PlayerId } from "../src/types.ts";
import { costOf, makeSeats, must, nextCycle, noHunters, noIncidents, offered, option, pickSkill, player, withoutDrugs } from "./support.ts";

const base = noIncidents(noHunters({ ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [] }));
const surgery = (target: PlayerId): Action => ({ type: "surgery", target });
const SEPSIS = "sepsis_disease";

/** The config with surgery's base odds set: 1 always succeeds, 0 always fails (skills multiply 0 to 0). */
const odds = (successChance: number): GameConfig => ({ ...base, surgery: { ...base.surgery, successChance, dirtyChance: 0 } });

/** Three humans in the Sick Bay (working Surgery Pod); p1 has a torn tongue. */
function ship(config: GameConfig = base): GameState {
  const s = withoutDrugs(createGame(makeSeats(3), config, 3));
  s.players.forEach((p) => {
    p.room = "SICK_BAY";
    p.role = "human";
  });
  addDisease(s, player(s, "p1"), "torn_tongue_injury");
  return s;
}

const injuries = (s: GameState, id: PlayerId) => player(s, id).modifiers.filter((m) => s.config.diseases.allInjuries.includes(m));

describe("surgery", () => {
  it("uses the owner's numbers", () => {
    const { cost, successChance, medicFactor, nurseFactor, dirtyChance } = DEFAULT_CONFIG.surgery;
    expect([cost.apOther, cost.apSelf, successChance, medicFactor, nurseFactor, dirtyChance]).toEqual([2, 4, 0.5, 1.5, 1.25, 0.25]);
    expect(DEFAULT_CONFIG.diseases.allDiseaseStats.find((d) => d.label === SEPSIS)).toMatchObject({ durationMin: 1, durationMax: 3 });
  });

  it("removes the patient's injury on a success and costs its AP on someone else", () => {
    const s = must(applyAction(ship(odds(1)), "p0", surgery("p1")));
    expect(injuries(s, "p1")).toEqual([]);
    expect(player(s, "p1").statuses).not.toContain("torn_tongue_injury");
    expect(player(s, "p0").ap).toBe(base.startAp - base.surgery.cost.apOther);
    expect(viewFor(s, "p2").log.some((e) => e.key === "operated")).toBe(true);
  });

  it("removes exactly one of several injuries", () => {
    const s = ship(odds(1));
    addDisease(s, player(s, "p1"), "burnt_hand_injury");
    expect(injuries(must(applyAction(s, "p0", surgery("p1"))), "p1")).toHaveLength(1);
  });

  it("costs more AP on yourself", () => {
    const s = ship(odds(1));
    addDisease(s, player(s, "p0"), "mashed_foot_injury");
    expect(costOf(s, "p0", surgery("p0"))?.ap).toBe(base.surgery.cost.apSelf);
    const r = must(applyAction(s, "p0", surgery("p0")));
    expect(injuries(r, "p0")).toEqual([]);
    expect(player(r, "p0").ap).toBe(base.startAp - base.surgery.cost.apSelf);
  });

  it("is paid with a care point instead of AP while you have one", () => {
    const s = ship(odds(1));
    player(s, "p0").resources.heal = 1;
    const r = must(applyAction(s, "p0", surgery("p1")));
    expect(player(r, "p0").ap).toBe(base.startAp);
    expect(player(r, "p0").resources.heal).toBe(0);
  });

  it("is offered only on injured patients, and needs a working Surgery Pod", () => {
    const s = ship();
    expect(offered(s, "p0")).toContainEqual(surgery("p1"));
    expect(offered(s, "p0")).not.toContainEqual(surgery("p2"));
    expect(offered(s, "p0")).not.toContainEqual(surgery("p0"));
    const r = applyAction(s, "p0", surgery("p2"));
    expect(r.ok).toBe(false);

    s.equipment["SICK_BAY"]!.find((e) => e.type === "SURGERY_POD")!.broken = true;
    expect(offered(s, "p0")).not.toContainEqual(surgery("p1"));
    expect(applyAction(s, "p0", surgery("p1")).ok).toBe(false);
  });

  it("can't be done outside the Sick Bay without being a medic holding a medikit", () => {
    let s = ship();
    s.players.forEach((p) => (p.room = "LABORATORY"));
    s.items.push({ id: "kit", type: "medikit", at: { kind: "player", id: "p0" } });
    expect(offered(s, "p0")).not.toContainEqual(surgery("p1"));
    s = pickSkill(s, "p0", "medic");
    expect(offered(s, "p0")).toContainEqual(surgery("p1"));
    s.items = s.items.filter((i) => i.id !== "kit");
    expect(offered(s, "p0")).not.toContainEqual(surgery("p1"));
  });

  it("multiplies the odds for a medic and a nurse", () => {
    const chance = (s: GameState) => option(s, "p0", surgery("p1"))!.chance;
    const { successChance, medicFactor, nurseFactor } = base.surgery;
    expect(chance(ship())).toBe(successChance);
    expect(chance(pickSkill(ship(), "p0", "medic"))).toBeCloseTo(successChance * medicFactor);
    expect(chance(pickSkill(ship(), "p0", "first_aid"))).toBeCloseTo(successChance * nurseFactor);
    expect(chance(pickSkill(pickSkill(ship(), "p0", "medic"), "p0", "first_aid"))).toBeCloseTo(successChance * medicFactor * nurseFactor);
  });

  it("has a 25% dirty chance", () => {
    expect(option(ship(), "p0", surgery("p1"))!.dirt).toBe(base.surgery.dirtyChance);
  });

  it("gives the patient sepsis on a failure, which costs 6 health at once", () => {
    const s = ship(odds(0));
    const hp = player(s, "p1").hp;
    const r = must(applyAction(s, "p0", surgery("p1")));
    expect(player(r, "p1").modifiers).toContain(SEPSIS);
    expect(injuries(r, "p1")).toEqual(["torn_tongue_injury"]);
    expect(player(r, "p1").hp).toBe(hp - 6);
    expect(player(r, "p0").ap).toBe(base.startAp - base.surgery.cost.apOther);
    expect(viewFor(r, "p2").log.some((e) => e.key === "operationFailed")).toBe(true);
  });

  it("keeps sepsis private to the patient", () => {
    const r = must(applyAction(ship(odds(0)), "p0", surgery("p1")));
    expect(viewFor(r, "p1").statuses).toContain(SEPSIS);
    expect(viewFor(r, "p0").players.find((o) => o.id === "p1")!.statuses).not.toContain(SEPSIS);
  });

  it("costs 4 health and 1 morale at each cycle change", () => {
    const s = ship();
    const p1 = player(s, "p1");
    addDisease(s, p1, SEPSIS);
    p1.diseaseTrackers.find((t) => t.name === SEPSIS)!.duration = 10;
    p1.hp = 12;
    p1.morale = 8;
    const r = nextCycle(s);
    expect(player(r, "p1").hp).toBe(12 - 4);
    expect(player(r, "p1").morale).toBe(8 - 1);
  });

  it("kills with the sepsis death cause", () => {
    const s = ship(odds(0));
    player(s, "p1").hp = 6;
    const r = must(applyAction(s, "p0", surgery("p1")));
    expect(player(r, "p1").alive).toBe(false);
    expect(r.log.find((e) => e.key === "died")?.params).toMatchObject({ name: player(r, "p1").character, cause: "sepsis" });
  });

  it("does nothing to a Mush beyond the status", () => {
    const s = ship(odds(0));
    const p1 = player(s, "p1");
    p1.role = "mush";
    const hp = p1.hp;
    const r = must(applyAction(s, "p0", surgery("p1")));
    expect(player(r, "p1").modifiers).toContain(SEPSIS);
    expect(player(r, "p1").hp).toBe(hp);
  });
});
