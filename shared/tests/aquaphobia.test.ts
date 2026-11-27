import { describe, expect, it } from "vitest";
import { addDisease } from "../src/diseases.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { costOf, makeSeats, mustApply, nextDay, noCharacterModifiers, player, testConfig } from "./support.ts";

// Aquaphobia (owner, 2026-11-27): a disorder in the random pool. A shower costs 2 more AP and 3 morale, and only one
// shower a day is allowed: any shower that day counts, even one taken before the disorder. Nothing to a Mush. Private.
const config = noCharacterModifiers(testConfig({ mushCount: 0, maxAp: 99, startAp: 20 }));
const AQUA = "aquaphobia_disorder";
const shower: Action = { type: "shower", equipment: "BEDROOM_A:SHOWER" };

/** p0 (aquaphobic unless `disorder` is false) and p1 in Bedroom Alpha. */
function ship(disorder = true): GameState {
  const s = createGame(makeSeats(2), config, 5);
  for (const p of s.players) {
    p.room = "BEDROOM_A";
    p.ap = 20;
    p.morale = 8;
  }
  if (disorder) addDisease(s, player(s, "p0"), AQUA);
  return s;
}

describe("Aquaphobia disorder", () => {
  it("pins the confirmed numbers", () => {
    expect(config.diseases.allDisorders).toContain(AQUA);
    expect(config.aquaphobia).toEqual({ apSurcharge: 2, moraleLoss: 3 });
  });

  it("a shower costs apSurcharge more AP and moraleLoss morale", () => {
    const s = ship();
    expect(costOf(s, "p0", shower)!.ap).toBe(config.shower.cost.ap + config.aquaphobia.apSurcharge);
    expect(costOf(s, "p1", shower)!.ap).toBe(config.shower.cost.ap);
    const after = mustApply(s, "p0", shower);
    expect(player(after, "p0").ap).toBe(20 - config.shower.cost.ap - config.aquaphobia.apSurcharge);
    expect(player(after, "p0").morale).toBe(8 - config.aquaphobia.moraleLoss);
    expect(viewFor(after, "p0").log.some((l) => l.key === "aquaphobiaMoraleLoss")).toBe(true);
    expect(viewFor(after, "p1").log.some((l) => l.key === "aquaphobiaMoraleLoss")).toBe(false);
  });

  it("allows one shower a day, and another the next day; others shower freely", () => {
    const s = mustApply(ship(), "p0", shower);
    expect(applyAction(s, "p0", shower).ok).toBe(false);
    mustApply(s, "p1", shower, shower);
    mustApply(nextDay(s), "p0", shower);
  });

  it("counts a shower taken earlier that day, before the disorder", () => {
    const s = mustApply(ship(false), "p0", shower);
    addDisease(s, player(s, "p0"), AQUA);
    expect(applyAction(s, "p0", shower).ok).toBe(false);
  });

  it("does nothing to a Mush", () => {
    const s = ship(false);
    const m = player(s, "p0");
    m.role = "mush";
    addDisease(s, m, AQUA);
    expect(costOf(s, "p0", shower)!.ap).toBe(config.shower.cost.ap);
    const after = mustApply(s, "p0", shower);
    expect(applyAction(after, "p0", shower).ok).toBe(true);
  });

  it("sends the daily flag to the one who showered only", () => {
    const s = mustApply(ship(), "p0", shower);
    expect(JSON.stringify(viewFor(s, "p0"))).toContain("showeredToday");
    expect(JSON.stringify(viewFor(s, "p1"))).not.toContain("showeredToday");
  });
});
