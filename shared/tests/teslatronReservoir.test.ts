import { describe, expect, it } from "vitest";
import { advanceNeron } from "../src/comms.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PATROL_SHIPS, patrolMaxCharges, patrolShip } from "../src/patrol.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectStatus } from "../src/projects.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, must, mustApply, nextCycle, player, setProgress } from "./support.ts";

const config = DEFAULT_CONFIG;
const LONGANE = patrolShip("PATROL_SHIP_A_0")!;
const JUJUBE = patrolShip("PATROL_SHIP_A_1")!;
const TAMARIN = patrolShip("PATROL_SHIP_A_2")!;
const SOCRATE = patrolShip("PATROL_SHIP_B_0")!;
const PASIPHAE = patrolShip("PATROL_SHIP_AA_1")!;
const workCore = (project: string): Action => ({ type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project });

function gameIn(room: string): GameState {
  const s = createGame(makeSeats(3, "others"), structuredClone(config), 7);
  player(s, "p0").room = room;
  return s;
}

describe("Teslatron reservoir (PATROLSHIP_EXTRA_AMMO)", () => {
  it("is fully implemented with +6 extra patrol ship charges", () => {
    expect(projectStatus("PATROLSHIP_EXTRA_AMMO")).toBe("full");
    expect([config.patrol.charges, config.project.patrolShipExtraAmmo.extraCharges]).toEqual([10, 6]);
  });

  it("caps docked patrol ship recharge at base charges until complete, then recharges up to +6", () => {
    let s = gameIn("NEXUS_ROOM");
    const baseMax = config.patrol.charges;
    s.patrolShips[LONGANE.id]!.charges = baseMax;
    s.projects.PATROLSHIP_EXTRA_AMMO = PROJECT_COMPLETE - 1;
    s = nextCycle(s);
    expect(s.patrolShips[LONGANE.id]!.charges).toBe(baseMax);

    s.projects.PATROLSHIP_EXTRA_AMMO = PROJECT_COMPLETE;
    expect(patrolMaxCharges(s, LONGANE)).toBe(baseMax + config.project.patrolShipExtraAmmo.extraCharges);
    expect(patrolMaxCharges(s, PASIPHAE)).toBe(0);

    s = nextCycle(s);
    expect(s.patrolShips[LONGANE.id]!.charges).toBe(baseMax + config.patrol.rechargePerCycle);

    // Ships in flight do not recharge at cycle change; docked ships top out at the new max.
    s.patrolShips[JUJUBE.id]!.out = true;
    s.patrolShips[JUJUBE.id]!.charges = baseMax;
    s.patrolShips[LONGANE.id]!.charges = patrolMaxCharges(s, LONGANE);
    s = nextCycle(s);
    expect(s.patrolShips[JUJUBE.id]!.charges).toBe(baseMax);
    expect(s.patrolShips[LONGANE.id]!.charges).toBe(patrolMaxCharges(s, LONGANE));
    expect(s.patrolShips[PASIPHAE.id]!.charges).toBe(0);
  });

  it("adds +6 charges (capped at new max) to non-destroyed patrol ships on completion at the core", () => {
    const s = gameIn("NEXUS_ROOM");
    const extra = config.project.patrolShipExtraAmmo.extraCharges;
    const newMax = config.patrol.charges + extra;

    s.patrolShips[LONGANE.id]!.charges = 0;
    s.patrolShips[JUJUBE.id]!.charges = config.patrol.charges - 2;
    s.patrolShips[TAMARIN.id]!.charges = config.patrol.charges;
    s.patrolShips[SOCRATE.id]!.out = true;
    s.patrolShips[SOCRATE.id]!.charges = 3;
    const destroyed = patrolShip("PATROL_SHIP_B_1")!;
    s.patrolShips[destroyed.id]!.destroyed = true;
    s.patrolShips[destroyed.id]!.charges = 0;

    setProgress(s, { project: "PATROLSHIP_EXTRA_AMMO" }, PROJECT_COMPLETE - 1);
    const done = mustApply(s, "p0", workCore("PATROLSHIP_EXTRA_AMMO"));

    expect(done.projects.PATROLSHIP_EXTRA_AMMO).toBe(PROJECT_COMPLETE);
    expect(done.patrolShips[LONGANE.id]!.charges).toBe(extra);
    expect(done.patrolShips[JUJUBE.id]!.charges).toBe(config.patrol.charges - 2 + extra);
    expect(done.patrolShips[TAMARIN.id]!.charges).toBe(newMax);
    expect(done.patrolShips[SOCRATE.id]!.charges).toBe(3 + extra);
    expect(done.patrolShips[destroyed.id]!.charges).toBe(0);
    expect(done.patrolShips[PASIPHAE.id]!.charges).toBe(0);
  });

  it("also grants the +6 charges when completed by a NERON update", () => {
    const s = gameIn("SPACESHIP_BAY_A");
    for (const id of PROJECT_IDS) if (id !== "PATROLSHIP_EXTRA_AMMO") s.projects[id] = PROJECT_COMPLETE;
    s.comms.neron.progress = 0;
    s.patrolShips[LONGANE.id]!.charges = 1;

    expect(advanceNeron(s, 100)).toBe("PATROLSHIP_EXTRA_AMMO");
    expect(s.patrolShips[LONGANE.id]!.charges).toBe(1 + config.project.patrolShipExtraAmmo.extraCharges);
    expect(patrolMaxCharges(s, LONGANE)).toBe(config.patrol.charges + config.project.patrolShipExtraAmmo.extraCharges);
  });

  it("lets a patrol ship fire all 16 charges after completion", () => {
    const s = gameIn(LONGANE.id);
    s.projects.PATROLSHIP_EXTRA_AMMO = PROJECT_COMPLETE;
    const newMax = patrolMaxCharges(s, LONGANE);
    s.patrolShips[LONGANE.id]!.out = true;
    s.patrolShips[LONGANE.id]!.charges = newMax;
    s.hunters.list = [{ id: "h1", type: "hunter", hp: 999, target: null }];

    let cur = s;
    const pilot = player(cur, "p0");
    pilot.skills.push("pilot");
    for (let i = 0; i < newMax; i++) {
      player(cur, "p0").ap = 10;
      cur = must(applyAction(cur, "p0", { type: "patrol_attack", equipment: `${LONGANE.id}:PATROL_COMMAND`, hunter: "h1" }));
    }
    expect(cur.patrolShips[LONGANE.id]!.charges).toBe(0);
    expect(viewFor(cur, "p0").patrolShip?.charges).toBe(0);
    expect(PATROL_SHIPS.filter((ship) => ship.kind === "patrol").every((ship) => patrolMaxCharges(cur, ship) === newMax)).toBe(true);
  });
});
