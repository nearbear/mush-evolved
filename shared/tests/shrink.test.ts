import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState, PlayerId } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, offered, pickSkill, player } from "./support.ts";

// No daily morale loss, so a cycle change moves morale only through the Shrink.
const base: GameConfig = { ...DEFAULT_CONFIG, mushCount: 1, startInventory: [], startItems: [], startSkills: [], moralePerDay: 0 };
const comfort = (target: PlayerId): Action => ({ type: "comfort", target });

/** p0 is the Shrink; p0, p1 and p3 share the sick bay, p2 is in the refectory. */
function ship(skill = "shrink"): GameState {
  let s = createGame(makeSeats(4), base, 3);
  player(s, "p0").room = player(s, "p1").room = player(s, "p3").room = "SICK_BAY";
  player(s, "p2").room = "REFECTORY";
  s = pickSkill(s, "p0", skill);
  for (const p of s.players) {
    p.ap = 10;
    p.morale = 5;
  }
  return s;
}

/** Puts the player in bed (the state lie_down leaves, without needing a free bed in their room). */
function lie(s: GameState, id: PlayerId): void {
  player(s, id).modifiers.push("lying_down");
}

describe("Comfort (Shrink)", () => {
  it("pins the decided numbers: 1 AP, +2 morale, +1 morale a cycle lying down", () => {
    expect([DEFAULT_CONFIG.comfort.cost.ap, DEFAULT_CONFIG.comfort.morale, DEFAULT_CONFIG.shrink.lyingMorale]).toEqual([1, 2, 1]);
  });

  it("is offered to the Shrink on each living roommate, never on themself, other rooms, or without the skill", () => {
    const s = ship();
    expect(offered(s, "p0")).toEqual(expect.arrayContaining([comfort("p1"), comfort("p3")]));
    expect(offered(s, "p0")).not.toContainEqual(comfort("p0"));
    expect(offered(s, "p0")).not.toContainEqual(comfort("p2"));
    expect(offered(s, "p1").some((a) => a.type === "comfort")).toBe(false);
    expect(applyAction(s, "p0", comfort("p2")).ok).toBe(false);
    expect(applyAction(s, "p1", comfort("p3")).ok).toBe(false);
    expect(applyAction(ship("leadership"), "p0", comfort("p1")).ok).toBe(false);
  });

  it("leaves state unchanged when illegal", () => {
    const s = ship();
    const before = JSON.stringify(s);
    applyAction(s, "p0", comfort("p2"));
    expect(JSON.stringify(s)).toBe(before);
  });

  it("costs the Shrink 1 AP and gives the target 2 morale, with no daily limit", () => {
    let s = mustApply(ship(), "p0", comfort("p1"), comfort("p1"));
    expect(player(s, "p0").ap).toBe(10 - 2 * base.comfort.cost.ap);
    expect(player(s, "p0").morale).toBe(5);
    expect(player(s, "p1").morale).toBe(5 + 2 * base.comfort.morale);
    s = mustApply(s, "p0", comfort("p1"));
    expect(player(s, "p1").morale).toBe(5 + 3 * base.comfort.morale);
  });

  it("is still offered at max morale, capping the gain (the AP is wasted)", () => {
    const s0 = ship();
    player(s0, "p1").morale = base.maxMorale;
    expect(offered(s0, "p0")).toContainEqual(comfort("p1"));
    const s = mustApply(s0, "p0", comfort("p1"));
    expect(player(s, "p1").morale).toBe(base.maxMorale);
    expect(player(s, "p0").ap).toBe(10 - base.comfort.cost.ap);
  });

  it("works for a Mush Shrink and on a Mush target", () => {
    const s0 = ship();
    player(s0, "p0").role = "mush";
    player(s0, "p1").role = "mush";
    expect(player(mustApply(s0, "p0", comfort("p1")), "p1").morale).toBe(5 + base.comfort.morale);
  });

  it("is public room history, without anyone's morale", () => {
    const s = mustApply(ship(), "p0", comfort("p1"));
    for (const id of ["p0", "p1", "p3"]) {
      const line = viewFor(s, id).log.find((l) => l.key === "comforted");
      expect(line?.params).toEqual({ name: player(s, "p0").character, target: player(s, "p1").character });
    }
    expect(viewFor(s, "p2").log.some((l) => l.key === "comforted")).toBe(false);
  });
});

describe("Shrink's lying-down morale", () => {
  it("gives +1 morale a cycle to each roommate lying down, not to those standing or elsewhere", () => {
    const s0 = ship();
    lie(s0, "p1");
    lie(s0, "p2");
    const s = nextCycle(s0);
    expect(player(s, "p1").morale).toBe(5 + base.shrink.lyingMorale);
    expect(player(s, "p2").morale).toBe(5);
    expect(player(s, "p3").morale).toBe(5);
  });

  it("doesn't give the lying Shrink anything from their own skill", () => {
    const s0 = ship();
    lie(s0, "p0");
    expect(player(nextCycle(s0), "p0").morale).toBe(5);
  });

  it("gives a lying Shrink morale from another Shrink, and doesn't stack two Shrinks", () => {
    const s0 = pickSkill(ship(), "p3", "shrink");
    lie(s0, "p0");
    lie(s0, "p1");
    const s = nextCycle(s0);
    expect(player(s, "p0").morale).toBe(5 + base.shrink.lyingMorale);
    expect(player(s, "p1").morale).toBe(5 + base.shrink.lyingMorale);
  });

  it("needs the Shrink alive, and caps at max morale", () => {
    const s0 = ship();
    lie(s0, "p1");
    lie(s0, "p3");
    player(s0, "p3").morale = base.maxMorale;
    expect(player(nextCycle(s0), "p3").morale).toBe(base.maxMorale);
    player(s0, "p0").alive = false;
    expect(player(nextCycle(s0), "p1").morale).toBe(5);
  });

  it("tells only the recipient, privately", () => {
    const s0 = ship();
    lie(s0, "p1");
    const s = nextCycle(s0);
    const lines = s.log.slice(s0.log.length);
    expect(lines.map((l) => l.key)).toEqual(["gainMorale", "cycleBegins"]);
    expect(lines[0]!.visibleTo).toEqual(["p1"]);
  });
});
