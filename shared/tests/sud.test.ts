import { describe, expect, it } from "vitest";
import { gainMorale } from "../src/adjustStats.ts";
import { addDisease } from "../src/diseases.ts";
import { DRUG_ITEMS } from "../src/itemIds.ts";
import { actionDirtRate, actionInjuryRate, actionSuccessRate, type CostContext } from "../src/modifiers.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState, PlayerState } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, noCharacterModifiers, player, testConfig } from "./support.ts";

// Addiction, `sud_disorder` (owner, 2026-11-27): a disorder. -2 max morale, success x0.75, injury and dirt x1.5
// (relative, capped at 1), every morale loss 1 bigger. Consuming a drug calms it for 3 cycles, like a Shrink's
// Comfort; a drug taken while it is calmed does nothing. Nothing to a Mush. Private.
const config = noCharacterModifiers(testConfig({ mushCount: 0 }));
const SUD = "sud_disorder";
const DRUG = DRUG_ITEMS[0]!;
const PILL = "item-test-pill";

/** p0 has Addiction (unless `disorder` is false) and carries a drug; p1 is healthy. */
function ship(disorder = true): GameState {
  const s = createGame(makeSeats(2), config, 5);
  for (const p of s.players) {
    p.ap = 8;
    p.morale = 5;
  }
  s.items.push({ id: PILL, type: DRUG, at: { kind: "player", id: "p0" } });
  if (disorder) addDisease(s, player(s, "p0"), SUD);
  return s;
}

const ctx = (state: GameState, actor: PlayerState): CostContext => ({ state, actor, action: { type: "repair" } as unknown as Action, tags: [] });
const tracker = (s: GameState) => player(s, "p0").diseaseTrackers.find((t) => t.name === SUD)!;
const consume = { type: "consume", item: PILL } as const;

describe("Addiction (sud_disorder)", () => {
  it("pins the confirmed numbers", () => {
    expect(config.diseases.allDisorders).toContain(SUD);
    expect(config.sud).toEqual({ maxMoraleLoss: 2, successFactor: 0.75, injuryFactor: 1.5, dirtFactor: 1.5, extraMoraleLoss: 1, drugPauseCycles: 3 });
  });

  it("takes maxMoraleLoss off the morale cap", () => {
    const s = ship();
    expect(player(s, "p0").maxMorale).toBe(config.maxMorale - config.sud.maxMoraleLoss);
    expect(player(s, "p1").maxMorale).toBe(config.maxMorale);
  });

  it("scales success, injury and dirt chances, relatively, with injury and dirt capped at 1", () => {
    const s = ship();
    const p = player(s, "p0");
    expect(actionSuccessRate(0.6, ctx(s, p))).toBeCloseTo(0.6 * config.sud.successFactor);
    expect(actionSuccessRate(1, ctx(s, p))).toBe(1);
    expect(actionInjuryRate(0.1, ctx(s, p))).toBeCloseTo(0.1 * config.sud.injuryFactor);
    expect(actionDirtRate(0.2, ctx(s, p))).toBeCloseTo(0.2 * config.sud.dirtFactor);
    expect(actionInjuryRate(0, ctx(s, p))).toBe(0);
    expect(actionDirtRate(0.9, ctx(s, p))).toBe(1);
  });

  it("makes every morale loss extraMoraleLoss bigger, but not gains", () => {
    const s = ship();
    gainMorale(s, player(s, "p0"), -2);
    gainMorale(s, player(s, "p1"), -2);
    expect(player(s, "p0").morale).toBe(5 - 2 - config.sud.extraMoraleLoss);
    expect(player(s, "p1").morale).toBe(3);
    gainMorale(s, player(s, "p0"), 1);
    expect(player(s, "p0").morale).toBe(5 - 2 - config.sud.extraMoraleLoss + 1);
  });

  it("a drug calms it for drugPauseCycles cycles, restoring the cap, then it acts again", () => {
    let s = mustApply(ship(), "p0", consume);
    expect(tracker(s).disabledFor).toBe(config.sud.drugPauseCycles);
    expect(player(s, "p0").maxMorale).toBe(config.maxMorale);
    expect(actionSuccessRate(0.6, ctx(s, player(s, "p0")))).toBeCloseTo(0.6);
    for (let i = 0; i < config.sud.drugPauseCycles - 1; i++) s = nextCycle(s);
    expect(tracker(s).disabledFor).toBe(1);
    s = nextCycle(s);
    expect(tracker(s).disabledFor).toBeUndefined();
    expect(player(s, "p0").maxMorale).toBe(config.maxMorale - config.sud.maxMoraleLoss);
  });

  it("calms before the drug's own effects, so a bad drug's morale loss isn't raised", () => {
    const s = ship();
    s.drugs[DRUG] = { morale: -2, ap: 0, mp: 0, treats: [] };
    const after = mustApply(s, "p0", consume);
    expect(player(after, "p0").morale).toBe(5 - 2);
  });

  it("a drug taken while it is calmed changes nothing", () => {
    let s = mustApply(ship(), "p0", consume);
    s = nextCycle(s);
    s.items.push({ id: "item-test-pill-2", type: DRUG, at: { kind: "player", id: "p0" } });
    const after = mustApply(s, "p0", { type: "consume", item: "item-test-pill-2" });
    expect(tracker(after).disabledFor).toBe(config.sud.drugPauseCycles - 1);
  });

  it("tells only the holder that it was calmed", () => {
    const s = mustApply(ship(), "p0", consume);
    expect(viewFor(s, "p0").log.some((l) => l.key === "disorderCalmed")).toBe(true);
    expect(viewFor(s, "p1").log.some((l) => l.key === "disorderCalmed")).toBe(false);
  });

  it("does nothing to a Mush", () => {
    const s = ship(false);
    const m = player(s, "p0");
    m.role = "mush";
    addDisease(s, m, SUD);
    expect(m.maxMorale).toBe(config.maxMorale);
    expect(actionSuccessRate(0.6, ctx(s, m))).toBeCloseTo(0.6);
    gainMorale(s, m, -2);
    expect(m.morale).toBe(3);
  });
});
