import { describe, expect, it } from "vitest";
import { breakEquipment, workingBreakable } from "../src/breakage.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PROJECT_COMPLETE, projectStatus } from "../src/projects.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { makeSeats, mustApply, offered, player } from "./support.ts";

function ship() {
  const s = createGame(makeSeats(3), structuredClone(DEFAULT_CONFIG), 1);
  // Make p0 Mush with politician skill and give scrap for reinforce tests.
  s.players[0]!.role = "mush";
  s.players[0]!.skills = ["politician", "electro_slime"];
  s.players[1]!.skills = ["engineer", "politician"];
  s.titles.commander = "p2";
  s.items.push({ id: "scrap-1", type: "metal_scraps", at: { kind: "room", id: "SICK_BAY" } });
  return s;
}

describe("Auxiliary terminals project (AUXILIARY_TERMINAL)", () => {
  it("is marked fully implemented in projectStatus", () => {
    expect(projectStatus("AUXILIARY_TERMINAL")).toBe("full");
  });

  it("keeps Sick Bay and Engine Room auxiliary terminals offline before completion (no access, project, coup, breakage, sabotage, reinforce, or relay view)", () => {
    for (const [room, equipment] of [
      ["SICK_BAY", "SICK_BAY:neron_sick"],
      ["MOTOR_ROOM", "MOTOR_ROOM:neron_engine"],
    ] as const) {
      const s = ship();
      player(s, "p0").room = room;
      player(s, "p1").room = room;
      player(s, "p0").cheats = ["freeHacking"];

      // Neither access, project, nor coup is offered (even with freeHacking).
      const p0Actions = offered(s, "p0");
      expect(p0Actions.some((a) => a.type === "access" && a.equipment === equipment)).toBe(false);
      expect(p0Actions.some((a) => a.type === "project" && a.equipment === equipment)).toBe(false);
      expect(p0Actions.some((a) => a.type === "coup" && a.equipment === equipment)).toBe(false);

      // Sabotage and green jelly skip offline auxiliary terminals.
      expect(p0Actions.some((a) => a.type === "sabotage" && "equipment" in a && a.equipment === equipment)).toBe(false);
      expect(p0Actions.some((a) => a.type === "green_jelly" && "equipment" in a && a.equipment === equipment)).toBe(false);

      // Reinforce skips offline auxiliary terminals.
      const p1Actions = offered(s, "p1");
      expect(p1Actions.some((a) => a.type === "reinforce" && "equipment" in a && a.equipment === equipment)).toBe(false);

      // Direct illegal calls fail and leave state unchanged.
      expect(applyAction(s, "p0", { type: "access", equipment }).ok).toBe(false);
      expect(applyAction(s, "p0", { type: "project", equipment, project: s.projectDeck[0]! }).ok).toBe(false);
      expect(applyAction(s, "p0", { type: "coup", equipment }).ok).toBe(false);
      expect(applyAction(s, "p0", { type: "sabotage", equipment }).ok).toBe(false);
      expect(applyAction(s, "p0", { type: "green_jelly", equipment }).ok).toBe(false);
      expect(applyAction(s, "p1", { type: "reinforce", equipment }).ok).toBe(false);

      // Breakage skips offline auxiliary terminals.
      expect(workingBreakable(s, room).some((e) => e.id === equipment)).toBe(false);
      const equipObj = s.equipment[room]!.find((e) => e.id === equipment)!;
      breakEquipment(s, equipObj);
      expect(equipObj.broken).toBeUndefined();

      // Relay view does not expose offered projects from an offline auxiliary terminal.
      const view = viewFor(s, "p1");
      expect(Object.keys(view.relay.projects)).toEqual([]);
      expect(Object.keys(view.projects)).toEqual([]);
    }
  });

  it("enables both auxiliary terminals once AUXILIARY_TERMINAL is complete", () => {
    const s = ship();
    s.projects.AUXILIARY_TERMINAL = PROJECT_COMPLETE;

    for (const [room, equipment] of [
      ["SICK_BAY", "SICK_BAY:neron_sick"],
      ["MOTOR_ROOM", "MOTOR_ROOM:neron_engine"],
    ] as const) {
      player(s, "p0").room = room;
      player(s, "p1").room = room;

      const p0Actions = offered(s, "p0");
      expect(p0Actions.some((a) => a.type === "access" && a.equipment === equipment)).toBe(true);
      expect(p0Actions.some((a) => a.type === "project" && a.equipment === equipment)).toBe(true);
      expect(p0Actions.some((a) => a.type === "coup" && a.equipment === equipment)).toBe(true);
      expect(p0Actions.some((a) => a.type === "sabotage" && "equipment" in a && a.equipment === equipment)).toBe(true);
      expect(p0Actions.some((a) => a.type === "green_jelly" && "equipment" in a && a.equipment === equipment)).toBe(true);

      if (room === "SICK_BAY") {
        expect(offered(s, "p1").some((a) => a.type === "reinforce" && "equipment" in a && a.equipment === equipment)).toBe(true);
      }

      // View shows offered projects and relay info.
      const view = viewFor(s, "p1");
      expect(Object.keys(view.relay.projects).length).toBeGreaterThan(0);

      // Access, project, and coup all succeed.
      let next = mustApply(s, "p1", { type: "access", equipment });
      const offeredId = Object.keys(view.relay.projects)[0]!;
      next = mustApply(next, "p1", { type: "project", equipment, project: offeredId });
      expect(next.projects[offeredId]).toBeGreaterThan(0);

      next = mustApply(next, "p0", { type: "coup", equipment });
      expect(player(next, "p0").coupPending).toBe(true);

      // Can also break once enabled.
      expect(workingBreakable(s, room).some((e) => e.id === equipment)).toBe(true);
    }
  });
});
