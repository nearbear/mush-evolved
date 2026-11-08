import { describe, expect, it } from "vitest";
import { getUp } from "../src/actions/lie_down.ts";
import { walk } from "../src/actions/summon.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { applyInput } from "../src/replay.ts";
import { createGame } from "../src/rules.ts";
import type { GameState, PlayerId } from "../src/types.ts";
import { forceDismantleOdds, clone, makeSeats, must, mustApply, nextCycle, noHunters, noIncidents, pickSkill, player } from "./support.ts";

forceDismantleOdds(1); // items and equipment have their own odds; these tests need the dismantle to succeed
const config = noIncidents(noHunters({ ...DEFAULT_CONFIG, characterModifiers: {}, mushCount: 1, startInventory: [], startItems: [], startSkills: [], dismantle: { ...DEFAULT_CONFIG.dismantle, successChance: 1, injuryChance: 0, dirtyChance: 0 } }));
const { cyclesLying, bonusAp, maxApMultiplier } = config.lethargy;

/** p0 to p3 in Bedroom A; p1 has Lethargy. */
function ship(): GameState {
  const s = createGame(makeSeats(4), config, 3);
  for (const p of s.players) p.room = "BEDROOM_A";
  return pickSkill(s, "p1", "lethargy");
}
const bed = (s: GameState) => s.equipment.BEDROOM_A!.find((e) => e.type === "BED")!.id;
const lieDown = (s: GameState, id: PlayerId) => mustApply(s, id, { type: "lie_down", equipment: bed(s) });
/** `n` cycle changes. */
function cycles(s: GameState, n: number): GameState {
  for (let i = 0; i < n; i++) s = nextCycle(s);
  return s;
}
const ap = (s: GameState, id: PlayerId) => player(s, id).ap;
/** AP gained by `id` over the next cycle change. */
const gain = (s: GameState, id: PlayerId) => ap(nextCycle(s), id) - ap(s, id);
const bedGain = config.apPerCycle + 1;

describe("lethargy", () => {
  it("follows the owner's flow: lying down at 0 AP gives 2, 4, 6, then 9 on the 4th cycle change, and +3 from then on", () => {
    let s = lieDown(ship(), "p1");
    player(s, "p1").ap = 0;
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      s = nextCycle(s);
      seen.push(ap(s, "p1"));
    }
    expect(seen).toEqual([2, 4, 6, 9, 12, 15]);
  });

  it("doubles the AP cap as soon as it is picked, and the gauge fills to it, never past", () => {
    const before = createGame(makeSeats(4), config, 3);
    expect(player(before, "p1").maxAp).toBe(config.maxAp);
    let s = ship();
    expect(player(s, "p1").maxAp).toBe(config.maxAp * maxApMultiplier);
    s = lieDown(s, "p1");
    s = cycles(s, 20);
    expect(ap(s, "p1")).toBe(config.maxAp * maxApMultiplier);
  });

  it("gives no bonus without the skill, or to a Lethargy player out of bed", () => {
    let s = ship();
    for (const p of s.players) p.ap = 0;
    s = lieDown(s, "p0");
    s = cycles(s, cyclesLying);
    expect(gain(s, "p0")).toBe(bedGain);
    expect(gain(s, "p1")).toBe(config.apPerCycle);
  });

  describe("getting up resets the count", () => {
    /** p1 lies down and spends `cyclesLying - 1` cycle changes in bed, so the next one carries the bonus. */
    function rested(): GameState {
      const s = ship();
      player(s, "p1").ap = 0;
      const lying = cycles(lieDown(s, "p1"), cyclesLying - 1);
      expect(gain(lying, "p1")).toBe(bedGain + bonusAp);
      return lying;
    }
    /** Back in bed after `up`: the next cycle gives only the bed's gain. */
    const restarted = (up: GameState) => {
      expect(player(up, "p1").lyingSince).toBeUndefined();
      const again = player(up, "p1").lyingIn ? up : lieDown(up, "p1");
      expect(gain(again, "p1")).toBe(bedGain);
      expect(gain(cycles(again, cyclesLying - 2), "p1")).toBe(bedGain);
      expect(gain(cycles(again, cyclesLying - 1), "p1")).toBe(bedGain + bonusAp);
    };

    it("through get up, even lying down again in the same cycle", () => {
      restarted(mustApply(rested(), "p1", { type: "get_up" }));
    });

    it("through another action", () => {
      restarted(mustApply(rested(), "p1", { type: "examine", target: { kind: "player", id: "p0" } }));
    });

    it("through the bed going away (a dismantled sofa)", () => {
      let s = ship();
      player(s, "p0").skills = ["engineer"];
      s.equipment.BEDROOM_A!.push({ id: "sofa", type: "SOFA" });
      s = mustApply(s, "p1", { type: "lie_down", equipment: "sofa" });
      player(s, "p1").ap = 0;
      s = cycles(s, cyclesLying - 1);
      expect(gain(s, "p1")).toBe(bedGain + bonusAp);
      const gone = mustApply(s, "p0", { type: "dismantle", equipment: "sofa" });
      expect(player(gone, "p1").lyingSince).toBeUndefined();
      expect(gain(gone, "p1")).toBe(config.apPerCycle);
    });

    it("through a summons", () => {
      const s = clone(rested());
      walk(s, "p1", s.config.rooms.BEDROOM_A![0]!);
      expect(player(s, "p1").lyingSince).toBeUndefined();
      expect(gain(s, "p1")).toBe(config.apPerCycle);
    });
  });

  it("the away check counts a Lethargy player as full only at their own cap", () => {
    const HOUR = 3_600_000;
    const T0 = 1_000_000_000_000;
    const s = must(applyInput(ship(), { type: "seen", players: ["p0", "p1", "p2", "p3"], at: T0 }));
    for (const p of s.players) p.ap = config.maxAp;
    const at = T0 + config.inactivity.inactiveAfterHours * HOUR;
    const away = must(applyInput(s, { type: "cycle", at }));
    expect(player(away, "p0").inactivity).toBe("inactive");
    expect(player(away, "p1").inactivity).toBeUndefined();
    const full = clone(s);
    player(full, "p1").ap = player(full, "p1").maxAp;
    expect(player(must(applyInput(full, { type: "cycle", at })), "p1").inactivity).toBe("inactive");
  });

  it("getUp clears the count wherever it is called from", () => {
    const s = lieDown(ship(), "p1");
    expect(player(s, "p1").lyingSince).toBe(s.cycle);
    const p = clone(s).players[1]!;
    getUp(p);
    expect(p.lyingSince).toBeUndefined();
  });
});

describe("hyperactive (Chao)", () => {
  it("gains 1 extra MP per cycle and no AP from lying down", () => {
    const s = ship();
    player(s, "p0").modifiers.push("hyperactive");
    player(s, "p0").mp = 0;
    for (const p of s.players) p.room = "BEDROOM_A";
    player(s, "p2").mp = 0;
    const second = s.equipment.BEDROOM_A!.filter((e) => e.type === "BED")[1]?.id ?? bed(s);
    const lying = mustApply(lieDown(s, "p0"), "p2", { type: "lie_down", equipment: second });
    const next = nextCycle(lying);
    expect(player(next, "p0").mp).toBe(player(next, "p2").mp + 1);
    expect(gain(lying, "p0")).toBe(config.apPerCycle);
    expect(gain(lying, "p2")).toBe(bedGain);
  });
});
