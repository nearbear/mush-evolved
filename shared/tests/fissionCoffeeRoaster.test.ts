import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { isDispenserReady } from "../src/dispense.ts";
import { PILGRED_COMPLETE } from "../src/pilgred.ts";
import { PROJECT_COMPLETE, projectStatus } from "../src/projects.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, noIncidents, offered, setProgress } from "./support.ts";

// No incidents: a random breakdown of the machine would make the schedule depend on the seed.
const config = noIncidents(DEFAULT_CONFIG);
const MACHINE = "REFECTORY:COFFEE_DISPENSER";
const pull: Action = { type: "dispense", equipment: MACHINE };
const workRoaster: Action = { type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project: "FISSION_COFFEE_ROASTER" };

function ship(): GameState {
  const s = createGame(makeSeats(3, "others"), config, 7);
  for (const p of s.players) p.room = "REFECTORY";
  return s;
}

describe("Fission Coffee Roaster project and coffee regeneration schedule", () => {
  it("is fully implemented (owner, 2026-11-02)", () => {
    expect(projectStatus("FISSION_COFFEE_ROASTER")).toBe("full");
  });

  describe("Base coffee machine (no Roaster, PILGRED broken)", () => {
    it("is ready at start, empties when taken, and stays empty until cycle 1 of the next day", () => {
      let s = ship();
      expect(offered(s, "p0")).toContainEqual(pull);

      // Taken at cycle 1
      s = mustApply(s, "p0", pull);
      expect(s.dispensedOn[MACHINE]).toBe(1);
      expect(offered(s, "p1")).not.toContainEqual(pull);

      // Cycles 2 through 8 of day 1: machine is empty
      for (let c = 2; c <= 8; c++) {
        s = nextCycle(s);
        expect(s.cycle).toBe(c);
        expect(offered(s, "p1")).not.toContainEqual(pull);
        expect(applyAction(s, "p1", pull)).toEqual({ ok: false, error: "illegal_action" });
        expect(ACTIONS.dispense.check(s, s.players[1]!, pull as never)).toBe("empty");
      }

      // Day 2, cycle 1 (cycle 9): regenerates
      s = nextCycle(s);
      expect(s.cycle).toBe(9);
      expect(offered(s, "p1")).toContainEqual(pull);
    });

    it("holds the coffee across cycles if uncollected, emptying only when taken", () => {
      let s = ship();
      // Cycle 1: p0 takes coffee
      s = mustApply(s, "p0", pull);

      // Advance to day 2 cycle 1 (cycle 9), where it regenerates
      while (s.cycle < 9) s = nextCycle(s);
      expect(offered(s, "p1")).toContainEqual(pull);

      // Nobody takes it in cycle 9; advance to cycle 10 (day 2 cycle 2)
      s = nextCycle(s);
      expect(s.cycle).toBe(10);
      expect(offered(s, "p1")).toContainEqual(pull);

      // p1 takes it at cycle 10
      s = mustApply(s, "p1", pull);
      expect(s.dispensedOn[MACHINE]).toBe(10);
      expect(offered(s, "p0")).not.toContainEqual(pull);

      // Cycle 11 (day 2 cycle 3): empty
      s = nextCycle(s);
      expect(offered(s, "p0")).not.toContainEqual(pull);

      // Remains empty until day 3 cycle 1 (cycle 17)
      while (s.cycle < 17) s = nextCycle(s);
      expect(offered(s, "p0")).toContainEqual(pull);
    });
  });

  describe("With Fission Coffee Roaster complete", () => {
    it("regenerates coffee at cycle 1 and cycle 5 of each day", () => {
      let s = ship();
      s.projects.FISSION_COFFEE_ROASTER = PROJECT_COMPLETE;

      // Taken at cycle 1
      s = mustApply(s, "p0", pull);
      expect(offered(s, "p1")).not.toContainEqual(pull);

      // Cycles 2, 3, 4: empty
      for (let c = 2; c <= 4; c++) {
        s = nextCycle(s);
        expect(offered(s, "p1")).not.toContainEqual(pull);
      }

      // Cycle 5: regenerates!
      s = nextCycle(s);
      expect(s.cycle).toBe(5);
      expect(offered(s, "p1")).toContainEqual(pull);

      // Taken at cycle 5
      s = mustApply(s, "p1", pull);
      expect(offered(s, "p2")).not.toContainEqual(pull);

      // Cycles 6, 7, 8: empty
      for (let c = 6; c <= 8; c++) {
        s = nextCycle(s);
        expect(offered(s, "p2")).not.toContainEqual(pull);
      }

      // Cycle 9 (Day 2 cycle 1): regenerates!
      s = nextCycle(s);
      expect(s.cycle).toBe(9);
      expect(offered(s, "p2")).toContainEqual(pull);
    });

    it("holds uncollected coffee until taken", () => {
      let s = ship();
      s.projects.FISSION_COFFEE_ROASTER = PROJECT_COMPLETE;
      s = mustApply(s, "p0", pull); // cycle 1

      // Advance past cycle 5 to cycle 6 without taking coffee
      while (s.cycle < 6) s = nextCycle(s);
      expect(s.cycle).toBe(6);
      expect(offered(s, "p1")).toContainEqual(pull);

      // Taking it at cycle 6 empties it for cycles 7 and 8
      s = mustApply(s, "p1", pull);
      s = nextCycle(s); // cycle 7
      expect(offered(s, "p2")).not.toContainEqual(pull);
      s = nextCycle(s); // cycle 8
      expect(offered(s, "p2")).not.toContainEqual(pull);
      s = nextCycle(s); // cycle 9 (day 2 cycle 1)
      expect(offered(s, "p2")).toContainEqual(pull);
    });
  });

  describe("With PILGRED repaired (no Roaster)", () => {
    it("regenerates coffee at cycles 1, 3, 5, 7", () => {
      let s = ship();
      s.pilgred.progress = PILGRED_COMPLETE;

      // Cycle 1: take coffee
      s = mustApply(s, "p0", pull);

      // Cycle 2: empty
      s = nextCycle(s);
      expect(offered(s, "p1")).not.toContainEqual(pull);

      // Cycle 3: regenerates
      s = nextCycle(s);
      expect(offered(s, "p1")).toContainEqual(pull);
      s = mustApply(s, "p1", pull);

      // Cycle 4: empty
      s = nextCycle(s);
      expect(offered(s, "p2")).not.toContainEqual(pull);

      // Cycle 5: regenerates
      s = nextCycle(s);
      expect(offered(s, "p2")).toContainEqual(pull);
      s = mustApply(s, "p2", pull);

      // Cycle 6: empty
      s = nextCycle(s);
      expect(offered(s, "p0")).not.toContainEqual(pull);

      // Cycle 7: regenerates
      s = nextCycle(s);
      expect(offered(s, "p0")).toContainEqual(pull);
      s = mustApply(s, "p0", pull);

      // Cycle 8: empty
      s = nextCycle(s);
      expect(offered(s, "p1")).not.toContainEqual(pull);

      // Cycle 9 (Day 2 cycle 1): regenerates
      s = nextCycle(s);
      expect(offered(s, "p1")).toContainEqual(pull);
    });
  });

  describe("With Both Fission Coffee Roaster and PILGRED repaired", () => {
    it("regenerates coffee every single cycle (cycles 1 through 8)", () => {
      let s = ship();
      s.projects.FISSION_COFFEE_ROASTER = PROJECT_COMPLETE;
      s.pilgred.progress = PILGRED_COMPLETE;

      for (let c = 1; c <= 8; c++) {
        expect(s.cycle).toBe(c);
        expect(offered(s, "p0")).toContainEqual(pull);
        s = mustApply(s, "p0", pull);
        expect(offered(s, "p1")).not.toContainEqual(pull);
        s = nextCycle(s);
      }

      // Day 2 cycle 1 is also available
      expect(s.cycle).toBe(9);
      expect(offered(s, "p0")).toContainEqual(pull);
    });
  });

  describe("Completing the project in-game at NERON core", () => {
    it("advances and unlocks the 2x/day regeneration schedule once completed", () => {
      let s = ship();
      s.players[0]!.room = "NEXUS_ROOM";

      // Empty the coffee machine at cycle 1
      s = mustApply(s, "p1", pull);
      expect(offered(s, "p2")).not.toContainEqual(pull);

      // Advance to cycle 4
      while (s.cycle < 4) s = nextCycle(s);

      // Work on Roaster to 100%
      setProgress(s, { project: "FISSION_COFFEE_ROASTER" }, PROJECT_COMPLETE - 1);
      s = mustApply(s, "p0", workRoaster);
      expect(s.projects.FISSION_COFFEE_ROASTER).toBe(PROJECT_COMPLETE);

      // At cycle 4, cycle 4 is not a regen cycle so it's still empty
      expect(offered(s, "p1")).not.toContainEqual(pull);

      // At cycle 5, it regenerates thanks to the completed project!
      s = nextCycle(s);
      expect(s.cycle).toBe(5);
      expect(offered(s, "p1")).toContainEqual(pull);
    });
  });

  describe("Hidden information", () => {
    it("keeps dispensedOn secret and only presents legality in view.actions", () => {
      const s = ship();
      const view = viewFor(s, "p0");
      expect((view as unknown as Record<string, unknown>).dispensedOn).toBeUndefined();
    });
  });
});
