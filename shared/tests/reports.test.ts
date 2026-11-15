import { describe, expect, it } from "vitest";
import { breakEquipment } from "../src/breakage.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { startFire } from "../src/fire.ts";
import { PROJECT_COMPLETE, projectStatus } from "../src/projects.ts";
import { applyInput } from "../src/replay.ts";
import { pruneReports } from "../src/reports.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameState } from "../src/types.ts";
import { clone, makeSeats, must, mustApply, noHunters, noIncidents, offered, option, player } from "./support.ts";

// Reports and the alert bar (owner, 2026-11-14, #444).

const HERE = "REFECTORY";
const ELSEWHERE = "LABORATORY";
const COFFEE = "REFECTORY:COFFEE_DISPENSER";

/** A quiet ship of 3: p0 and p1 in the refectory, p2 in the laboratory. */
function ship(): GameState {
  const s = createGame(makeSeats(3), { ...noIncidents(noHunters(DEFAULT_CONFIG)), mushCount: 1, startItems: [], startSkills: [] }, 3);
  for (const p of s.players) p.room = p.id === "p2" ? ELSEWHERE : HERE;
  return s;
}

const equipment = (s: GameState, id: string) => Object.values(s.equipment).flat().find((e) => e.id === id)!;
const breakIt = (s: GameState, id: string) => breakEquipment(s, equipment(s, id));
const globalSystem = (s: GameState) => s.chat.filter((m) => m.channel === "global" && m.system).map((m) => m.system!);
const labEquipment = (s: GameState) => s.equipment[ELSEWHERE]!.find((e) => DEFAULT_CONFIG.repair.chance[e.type] !== undefined)!;

describe("reporting a fire", () => {
  it("is free", () => {
    expect(DEFAULT_CONFIG.report.cost.ap).toBe(0);
    const s = ship();
    startFire(s, HERE);
    expect(option(s, "p0", { type: "report_fire" })?.cost).toMatchObject({ ap: 0, mp: 0 });
  });

  it("is offered only in a burning room, and posts NERON's line naming the reporter and the room", () => {
    const s = ship();
    expect(offered(s, "p0")).not.toContainEqual({ type: "report_fire" });
    startFire(s, HERE);
    expect(offered(s, "p2")).not.toContainEqual({ type: "report_fire" });
    const ap = player(s, "p0").ap;
    const after = mustApply(s, "p0", { type: "report_fire" });
    expect(player(after, "p0").ap).toBe(ap);
    expect(after.reports).toEqual([{ kind: "fire", room: HERE, by: "p0" }]);
    expect(globalSystem(after).at(-1)).toEqual({ key: "fireReported", params: { name: player(s, "p0").character, room: HERE } });
    // Reported once: nobody can report it again.
    expect(offered(after, "p1")).not.toContainEqual({ type: "report_fire" });
  });

  it("Mush can report too", () => {
    const s = ship();
    for (const p of s.players) p.role = p.id === "p0" ? "mush" : "human";
    startFire(s, HERE);
    expect(offered(s, "p0")).toContainEqual({ type: "report_fire" });
  });

  it("illegal attempts leave the state unchanged: no fire, or already reported", () => {
    const s = ship();
    expect(applyAction(s, "p0", { type: "report_fire" }).ok).toBe(false);
    startFire(s, HERE);
    const reported = mustApply(s, "p0", { type: "report_fire" });
    const before = clone(reported);
    expect(applyAction(reported, "p1", { type: "report_fire" }).ok).toBe(false);
    expect(reported).toEqual(before);
  });

  it("lights the room on everyone's minimap and locates it on the alert bar", () => {
    const s = ship();
    startFire(s, HERE);
    startFire(s, "BRIDGE");
    expect(viewFor(s, "p2").burningRooms).toEqual([]);
    expect(viewFor(s, "p2").alerts).toEqual({ fires: 2, broken: 0, reports: [] });
    const after = mustApply(s, "p0", { type: "report_fire" });
    expect(viewFor(after, "p2").burningRooms).toEqual([HERE]);
    expect(viewFor(after, "p2").alerts).toEqual({ fires: 2, broken: 0, reports: [{ kind: "fire", room: HERE, by: player(s, "p0").character }] });
  });
});

describe("reporting a breakdown", () => {
  it("is offered on broken equipment in your room only, and names the equipment and room", () => {
    const s = ship();
    expect(offered(s, "p0").some((a) => a.type === "report_equipment")).toBe(false);
    breakIt(s, COFFEE);
    breakIt(s, labEquipment(s).id);
    expect(offered(s, "p0").filter((a) => a.type === "report_equipment")).toEqual([{ type: "report_equipment", equipment: COFFEE }]);
    const after = mustApply(s, "p0", { type: "report_equipment", equipment: COFFEE });
    expect(globalSystem(after).at(-1)).toEqual({ key: "equipmentReported", params: { name: player(s, "p0").character, room: HERE, equipment: "COFFEE_DISPENSER" } });
    expect(viewFor(after, "p2").alerts).toEqual({ fires: 0, broken: 2, reports: [{ kind: "equipment", room: HERE, equipment: "COFFEE_DISPENSER", by: player(s, "p0").character }] });
    expect(offered(after, "p1").some((a) => a.type === "report_equipment")).toBe(false);
  });

  it("refuses working equipment, equipment elsewhere, and a repeat", () => {
    const s = ship();
    expect(applyAction(s, "p0", { type: "report_equipment", equipment: COFFEE }).ok).toBe(false);
    const lab = labEquipment(s).id;
    breakIt(s, lab);
    expect(applyAction(s, "p0", { type: "report_equipment", equipment: lab }).ok).toBe(false);
    breakIt(s, COFFEE);
    const after = mustApply(s, "p0", { type: "report_equipment", equipment: COFFEE });
    expect(applyAction(after, "p1", { type: "report_equipment", equipment: COFFEE }).ok).toBe(false);
  });
});

describe("detectors", () => {
  it("both are marked fully implemented", () => {
    expect(projectStatus("FIRE_SENSOR")).toBe("full");
    expect(projectStatus("EQUIPMENT_SENSOR")).toBe("full");
  });

  it("Fire detectors report every fire, existing and future, and the action stops being offered", () => {
    const s = ship();
    startFire(s, HERE);
    s.projects.FIRE_SENSOR = PROJECT_COMPLETE;
    startFire(s, "BRIDGE");
    expect(offered(s, "p0")).not.toContainEqual({ type: "report_fire" });
    expect(viewFor(s, "p2").burningRooms).toEqual([HERE, "BRIDGE"]);
    expect(viewFor(s, "p2").alerts.reports).toEqual([
      { kind: "fire", room: HERE, by: "FIRE_SENSOR" },
      { kind: "fire", room: "BRIDGE", by: "FIRE_SENSOR" },
    ]);
  });

  it("the Anomaly detector reports every broken piece of equipment, and the action stops being offered", () => {
    const s = ship();
    breakIt(s, COFFEE);
    s.projects.EQUIPMENT_SENSOR = PROJECT_COMPLETE;
    const lab = labEquipment(s);
    breakIt(s, lab.id);
    expect(offered(s, "p0").some((a) => a.type === "report_equipment")).toBe(false);
    const reports = viewFor(s, "p2").alerts.reports;
    expect(reports).toHaveLength(2);
    expect(reports).toEqual(
      expect.arrayContaining([
        { kind: "equipment", room: HERE, equipment: "COFFEE_DISPENSER", by: "EQUIPMENT_SENSOR" },
        { kind: "equipment", room: ELSEWHERE, equipment: lab.type, by: "EQUIPMENT_SENSOR" },
      ]),
    );
    // Breakdowns never light the minimap.
    expect(viewFor(s, "p2").burningRooms).toEqual([]);
  });
});

describe("a report lasts until the problem is fixed", () => {
  it("putting the fire out drops the report after the input, and a relit fire starts unreported", () => {
    let s = ship();
    startFire(s, HERE);
    s = mustApply(s, "p0", { type: "report_fire" });
    // However it went out (an extinguisher, a drone, the Superkube): the next input prunes it.
    s.fires = [];
    s = must(applyInput(s, { type: "seen", players: ["p0"], at: 1 }));
    expect(s.reports).toEqual([]);
    startFire(s, HERE);
    expect(viewFor(s, "p2").burningRooms).toEqual([]);
    expect(offered(s, "p0")).toContainEqual({ type: "report_fire" });
  });

  it("a fire relit within the same input still starts unreported", () => {
    let s = ship();
    startFire(s, HERE);
    s = mustApply(s, "p0", { type: "report_fire" });
    s.fires = [];
    startFire(s, HERE);
    expect(s.reports).toEqual([]);
  });

  it("repairing drops the report, and breaking again starts unreported", () => {
    let s = ship();
    breakIt(s, COFFEE);
    s = mustApply(s, "p0", { type: "report_equipment", equipment: COFFEE });
    delete equipment(s, COFFEE).broken;
    expect(pruneReports(s).reports).toEqual([]);
    breakIt(s, COFFEE);
    expect(s.reports).toEqual([]);
    expect(viewFor(s, "p2").alerts).toEqual({ fires: 0, broken: 1, reports: [] });
  });

  it("pruning never mutates its input and keeps open reports", () => {
    let s = ship();
    startFire(s, HERE);
    s = mustApply(s, "p0", { type: "report_fire" });
    expect(pruneReports(s)).toBe(s);
    const stale = { ...s, fires: [] };
    expect(pruneReports(stale).reports).toEqual([]);
    expect(stale.reports).toHaveLength(1);
  });
});

describe("hidden information", () => {
  it("an unreported fire's room and an unreported breakdown's identity reach nobody", () => {
    const s = ship();
    startFire(s, ELSEWHERE);
    breakIt(s, labEquipment(s).id);
    for (const id of ["p0", "p1"]) {
      const v = viewFor(s, id);
      expect(v.alerts).toEqual({ fires: 1, broken: 1, reports: [] });
      expect(v.burningRooms).toEqual([]);
      expect(JSON.stringify(v.alerts)).not.toContain(ELSEWHERE);
    }
  });

  it("the dead get no alerts and no burning rooms", () => {
    let s = ship();
    startFire(s, HERE);
    breakIt(s, COFFEE);
    s = mustApply(s, "p0", { type: "report_fire" }, { type: "report_equipment", equipment: COFFEE });
    player(s, "p2").alive = false;
    expect(viewFor(s, "p2").alerts).toEqual({ fires: 0, broken: 0, reports: [] });
    expect(viewFor(s, "p2").burningRooms).toEqual([]);
  });
});
