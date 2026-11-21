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
    const missed = mustApply(withExtinguish(s, { manual: { chance: 0.0001, failureMultiplier: 2 } }), "p0", MANUAL);
    expect(missed.failureStreaks.p0?.extinguish_manually).toBe(1);
    expect(missed.fires).toEqual([HERE]);
    expect(missed.log.find((e) => e.key === "extinguishFailed")).toMatchObject({ visibleTo: ["p0"] });
    const streak = { ...s, failureStreaks: { p0: { extinguish_manually: 2 } } };
    expect(option(streak, "p0", MANUAL)?.chance).toBeCloseTo(0.5 * 1.25 ** 2);
    const done = mustApply(withExtinguish(streak, { manual: { chance: 1, failureMultiplier: 1.25 } }), "p0", MANUAL);
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

  it("every Firefighter try risks the 2 HP injury, even a miss; others never do", () => {
    const hurt = withExtinguish(burning(), { manual: { chance: 0.0001, failureMultiplier: 1 }, firefighterInjuryChance: 1 });
    const out = mustApply(hurt, "p0", MANUAL);
    expect(player(out, "p0").hp).toBe(player(hurt, "p0").hp - 2);
    expect(out.log.some((e) => e.key === "randomInjury" && e.visibleTo !== "all")).toBe(true);

    const safe = withExtinguish(burning(), { firefighterInjuryChance: 0 });
    expect(player(mustApply(safe, "p0", MANUAL), "p0").hp).toBe(player(safe, "p0").hp);

    const other = withExtinguish(burning(), { firefighterInjuryChance: 1 });
    other.items.push({ id: "x", type: "extinguisher", at: { kind: "room", id: HERE } });
    const same = mustApply(other, "p1", { type: "extinguish", item: "x" });
    expect(player(same, "p1").hp).toBe(player(other, "p1").hp);
  });
});
