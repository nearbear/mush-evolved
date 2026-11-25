import { describe, expect, it } from "vitest";
import { applyAction, createGame } from "../src/rules.ts";
import type { GameConfig, GameState } from "../src/types.ts";
import { makeSeats, mustApply, offered, option, pickSkill, player, testConfig } from "./support.ts";

const HERE = "REFECTORY";
const MANUAL = { type: "extinguish_manually" } as const;

/** p0 (a Firefighter) and p1 in a burning refectory, no extinguisher anywhere. */
function burning(): GameState {
  const s = createGame(makeSeats(2), testConfig(), 3);
  for (const p of s.players) p.room = HERE;
  s.fires = [HERE];
  return pickSkill(s, "p0", "fireman");
}

const withExtinguish = (s: GameState, patch: Partial<GameConfig["extinguish"]>): GameState => ({ ...s, config: { ...s.config, extinguish: { ...s.config.extinguish, ...patch } } });

describe("Firefighter", () => {
  it("manual extinguish: 1 AP, 50%, x1.25 for each miss in a row, reset by a success", () => {
    const s = burning();
    expect(option(s, "p0", MANUAL)).toMatchObject({ cost: { ap: 1 }, chance: 0.5 });
    const missed = mustApply(withExtinguish(s, { manual: { ...s.config.extinguish.manual, chance: 0.0001, failureMultiplier: 2 } }), "p0", MANUAL);
    expect(missed.failureStreaks.p0?.extinguish_manually).toBe(1);
    expect(missed.fires).toEqual([HERE]);
    expect(missed.log.find((e) => e.key === "extinguishFailed")).toMatchObject({ visibleTo: ["p0"] });
    const streak = { ...s, failureStreaks: { p0: { extinguish_manually: 2 } } };
    expect(option(streak, "p0", MANUAL)?.chance).toBeCloseTo(0.5 * 1.25 ** 2);
    const done = mustApply(withExtinguish(streak, { manual: { ...s.config.extinguish.manual, chance: 1, failureMultiplier: 1.25 } }), "p0", MANUAL);
    expect(done.fires).toEqual([]);
    expect(done.failureStreaks.p0).toBeUndefined();
    expect(done.log.find((e) => e.key === "fireExtinguished")).toMatchObject({ key: "fireExtinguished", room: HERE, visibleTo: "all" });
  });

  it("is only for a Firefighter, in a burning room, with no extinguisher in reach", () => {
    const s = burning();
    expect(offered(s, "p1").filter((a) => a.type === "extinguish_manually")).toEqual([]);
    expect(applyAction(s, "p1", MANUAL)).toEqual({ ok: false, error: "illegal_action" });
    s.fires = [];
    expect(offered(s, "p0").filter((a) => a.type === "extinguish_manually")).toEqual([]);
    s.fires = [HERE];
    s.items.push({ id: "x", type: "extinguisher", at: { kind: "room", id: HERE } });
    expect(offered(s, "p0").filter((a) => a.type === "extinguish_manually")).toEqual([]);
  });

  it("an extinguisher never fails for a Firefighter, but others keep 50%", () => {
    const s = burning();
    s.items.push({ id: "x", type: "extinguisher", at: { kind: "room", id: HERE } });
    expect(option(s, "p0", { type: "extinguish", item: "x" })?.chance).toBe(1);
    expect(option(s, "p1", { type: "extinguish", item: "x" })?.chance).toBe(s.config.extinguish.chance);
  });

  it("pins eMush's dirt and injury odds per try: 15% and 1% with an extinguisher, 25% and 50% by hand", () => {
    const { dirtyChance, injuryChance, manual } = testConfig().extinguish;
    expect([dirtyChance, injuryChance, manual.dirtyChance, manual.injuryChance]).toEqual([0.15, 0.01, 0.25, 0.5]);
  });

  it("every manual try risks the 2 HP injury, even a miss", () => {
    const hurt = withExtinguish(burning(), { manual: { ...testConfig().extinguish.manual, chance: 0.0001, failureMultiplier: 1, injuryChance: 1 } });
    const out = mustApply(hurt, "p0", MANUAL);
    expect(player(out, "p0").hp).toBe(player(hurt, "p0").hp - 2);
    expect(out.log.some((e) => e.key === "randomInjury" && e.visibleTo !== "all")).toBe(true);

    const safe = withExtinguish(burning(), { manual: { ...testConfig().extinguish.manual, injuryChance: 0 } });
    expect(player(mustApply(safe, "p0", MANUAL), "p0").hp).toBe(player(safe, "p0").hp);
  });

  it("an extinguisher's injury and dirt odds are the same for everyone, a Firefighter included", () => {
    const s = burning();
    s.items.push({ id: "x", type: "extinguisher", at: { kind: "room", id: HERE } });
    const use = { type: "extinguish", item: "x" } as const;
    for (const id of ["p0", "p1"]) {
      expect(option(s, id, use)).toMatchObject({ injury: s.config.extinguish.injuryChance, dirt: s.config.extinguish.dirtyChance });
    }
    const hurt = withExtinguish(s, { injuryChance: 1 });
    const out = mustApply(hurt, "p1", use);
    expect(player(out, "p1").hp).toBe(player(hurt, "p1").hp - 2);
  });
});
