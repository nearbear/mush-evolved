import { describe, expect, it } from "vitest";
import { addDisease } from "../src/diseases.ts";
import { dailyMoraleLoss } from "../src/modifiers.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { GameState, PlayerId } from "../src/types.ts";
import { makeSeats, mustApply, noCharacterModifiers, nextCycle, nextDay, pickSkill, player, testConfig } from "./support.ts";

// Depression (owner, 2026-11-25): a disorder, forever; -2 max AP, -2 max morale, +1 daily morale loss. A Shrink's
// Comfort calms one random active disorder for 2-8 cycles. Nothing to a Mush. Private.
const config = noCharacterModifiers(testConfig({ mushCount: 0 }));
const DEPRESSION = "depression_disorder";

/** p0 is a Shrink; p0 and p1 share the sick bay, p2 is in the refectory. p1 is depressed. */
function ship(): GameState {
  let s = createGame(makeSeats(3), config, 5);
  player(s, "p0").room = player(s, "p1").room = "SICK_BAY";
  player(s, "p2").room = "REFECTORY";
  s = pickSkill(s, "p0", "shrink");
  for (const p of s.players) {
    p.ap = 8;
    p.morale = 5;
  }
  addDisease(s, player(s, "p1"), DEPRESSION);
  return s;
}

const comfort = (target: PlayerId) => ({ type: "comfort" as const, target });
const tracker = (s: GameState, id: PlayerId) => player(s, id).diseaseTrackers.find((t) => t.name === DEPRESSION)!;

describe("Depression disorder", () => {
  it("pins the confirmed numbers", () => {
    expect(config.diseases.allDisorders).toContain(DEPRESSION);
    expect(config.comfort.disorderPauseCycles).toEqual({ min: 2, max: 8 });
    const s = ship();
    const p1 = player(s, "p1");
    expect([config.maxAp - p1.maxAp, config.maxMorale - p1.maxMorale]).toEqual([2, 2]);
    expect(dailyMoraleLoss(s, p1) - dailyMoraleLoss(s, player(s, "p2"))).toBe(1);
  });

  it("lowers the caps at once, clamping current values", () => {
    const s = createGame(makeSeats(2), config, 5);
    const p = player(s, "p0");
    p.ap = config.maxAp;
    p.morale = config.maxMorale;
    addDisease(s, p, DEPRESSION);
    expect(p.ap).toBe(p.maxAp);
    expect(p.morale).toBe(p.maxMorale);
    expect(p.statuses).toContain(DEPRESSION);
  });

  it("lasts forever", () => {
    let s = ship();
    for (let i = 0; i < 12; i++) s = nextCycle(s);
    expect(player(s, "p1").modifiers).toContain(DEPRESSION);
    expect(player(s, "p1").maxAp).toBe(config.maxAp - 2);
  });

  it("costs 1 more morale at the end of a day", () => {
    let s = ship();
    s = nextDay(s);
    expect(5 - player(s, "p2").morale).toBe(config.moralePerDay);
    expect(5 - player(s, "p1").morale).toBe(config.moralePerDay + 1);
  });

  it("does nothing to a Mush", () => {
    const s = createGame(makeSeats(2), config, 5);
    const p = player(s, "p0");
    p.role = "mush";
    addDisease(s, p, DEPRESSION);
    expect(p.modifiers).toContain(DEPRESSION);
    expect([p.maxAp, p.maxMorale]).toEqual([config.maxAp, config.maxMorale]);
    expect(dailyMoraleLoss(s, p)).toBe(dailyMoraleLoss(s, player(s, "p1")));
  });

  it("is private: no one else sees it, and only the holder gets their trackers", () => {
    const s = ship();
    expect(viewFor(s, "p1").statuses).toContain(DEPRESSION);
    expect(viewFor(s, "p0").players.find((o) => o.id === "p1")!.statuses).not.toContain(DEPRESSION);
  });
});

describe("Comfort calms a disorder", () => {
  it("calms it for 2-8 cycles, restoring the caps, then it acts again", () => {
    let s = mustApply(ship(), "p0", comfort("p1"));
    const cycles = tracker(s, "p1").disabledFor!;
    expect(cycles).toBeGreaterThanOrEqual(config.comfort.disorderPauseCycles.min);
    expect(cycles).toBeLessThanOrEqual(config.comfort.disorderPauseCycles.max);
    expect([player(s, "p1").maxAp, player(s, "p1").maxMorale]).toEqual([config.maxAp, config.maxMorale]);
    expect(player(s, "p1").morale).toBe(5 + config.comfort.morale);
    expect(dailyMoraleLoss(s, player(s, "p1"))).toBe(dailyMoraleLoss(s, player(s, "p2")));
    for (let i = 0; i < cycles - 1; i++) s = nextCycle(s);
    expect(tracker(s, "p1").disabledFor).toBe(1);
    expect(player(s, "p1").maxAp).toBe(config.maxAp);
    s = nextCycle(s);
    expect(tracker(s, "p1").disabledFor).toBeUndefined();
    expect([player(s, "p1").maxAp, player(s, "p1").maxMorale]).toEqual([config.maxAp - 2, config.maxMorale - 2]);
    expect(player(s, "p1").modifiers).toContain(DEPRESSION);
  });

  it("tells only the comforted player, who sees it calmed in their own view", () => {
    const s = mustApply(ship(), "p0", comfort("p1"));
    const calmed = (id: PlayerId) => viewFor(s, id).log.some((l) => l.key === "disorderCalmed");
    expect(calmed("p1")).toBe(true);
    expect(calmed("p0")).toBe(false);
    expect(calmed("p2")).toBe(false);
    expect(viewFor(s, "p1").you.diseaseTrackers.find((t) => t.name === DEPRESSION)!.disabledFor).toBeDefined();
  });

  it("does nothing more when every disorder is already calmed", () => {
    const s = mustApply(ship(), "p0", comfort("p1"));
    const before = tracker(s, "p1").disabledFor;
    const after = mustApply(s, "p0", comfort("p1"));
    expect(tracker(after, "p1").disabledFor).toBe(before);
    expect(viewFor(after, "p1").log.filter((l) => l.key === "disorderCalmed")).toHaveLength(1);
  });

  it("leaves a player without disorders with only the morale", () => {
    let s = ship();
    player(s, "p0").room = "REFECTORY";
    s = mustApply(s, "p0", comfort("p2"));
    expect(player(s, "p2").diseaseTrackers).toEqual([]);
    expect(viewFor(s, "p2").log.some((l) => l.key === "disorderCalmed")).toBe(false);
  });
});
