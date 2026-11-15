import { describe, expect, it } from "vitest";
import { advanceNeron } from "../src/comms.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { allTurrets, turretCharges, turretRechargePerCycle } from "../src/hunters.ts";
import { PATROL_SHIPS } from "../src/patrol.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectStatus } from "../src/projects.ts";
import { createGame } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, noIncidents, player, setProgress } from "./support.ts";

const config = DEFAULT_CONFIG;
const workCore = (project: string): Action => ({ type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project });

function game(): GameState {
  return noIncidents(createGame(makeSeats(3, "others"), structuredClone(config), 7));
}

describe("Inverted pulsator (TURRET_EXTRA_FIRERATE)", () => {
  it("is fully implemented and doubles turret recharge rate", () => {
    expect(projectStatus("TURRET_EXTRA_FIRERATE")).toBe("full");
    expect(config.project.turretExtraFirerate.rechargeMultiplier).toBe(2);
    expect(config.turrets.rechargePerCycle).toBe(1);
  });

  it("does not change turret recharge until complete", () => {
    const s = game();
    const turret = allTurrets(s)[0]!;
    s.turrets[turret.id] = 1;
    expect(turretRechargePerCycle(s)).toBe(config.turrets.rechargePerCycle);

    const after = nextCycle(s);
    expect(turretCharges(after, turret.id)).toBe(1 + config.turrets.rechargePerCycle);

    const almost = game();
    almost.projects.TURRET_EXTRA_FIRERATE = PROJECT_COMPLETE - 1;
    almost.turrets[turret.id] = 1;
    expect(turretRechargePerCycle(almost)).toBe(config.turrets.rechargePerCycle);

    const afterAlmost = nextCycle(almost);
    expect(turretCharges(afterAlmost, turret.id)).toBe(1 + config.turrets.rechargePerCycle);
  });

  it("doubles per-cycle recharge on working turrets once complete, capped at max charges", () => {
    const s = game();
    s.projects.TURRET_EXTRA_FIRERATE = PROJECT_COMPLETE;
    expect(turretRechargePerCycle(s)).toBe(config.turrets.rechargePerCycle * config.project.turretExtraFirerate.rechargeMultiplier);

    const [t0, t1, t2] = allTurrets(s);
    s.turrets[t0!.id] = 0;
    s.turrets[t1!.id] = 3;
    t2!.broken = true;
    s.turrets[t2!.id] = 1;

    const after = nextCycle(s);
    expect(turretCharges(after, t0!.id)).toBe(2);
    // Capped at max charges (4) and deleted from sparse dict once full.
    expect(turretCharges(after, t1!.id)).toBe(config.turrets.charges);
    expect(after.turrets[t1!.id]).toBeUndefined();
    // Broken turrets do not recharge and keep their stored charge count.
    expect(turretCharges(after, t2!.id)).toBe(0);
    expect(after.turrets[t2!.id]).toBe(1);
  });

  it("does not affect patrol ship recharge", () => {
    const s = game();
    s.projects.TURRET_EXTRA_FIRERATE = PROJECT_COMPLETE;
    const ship = PATROL_SHIPS[0]!;
    s.patrolShips[ship.id]!.charges = 2;

    const after = nextCycle(s);
    expect(after.patrolShips[ship.id]!.charges).toBe(2 + config.patrol.rechargePerCycle);
  });

  it("activates when worked to 100% at the core or completed by a NERON update", () => {
    const s = game();
    const turret = allTurrets(s)[0]!;
    s.turrets[turret.id] = 0;
    player(s, "p0").room = "NEXUS_ROOM";
    setProgress(s, { project: "TURRET_EXTRA_FIRERATE" }, PROJECT_COMPLETE - 1);

    const done = mustApply(s, "p0", workCore("TURRET_EXTRA_FIRERATE"));
    expect(done.projects.TURRET_EXTRA_FIRERATE).toBe(PROJECT_COMPLETE);
    expect(turretCharges(nextCycle(done), turret.id)).toBe(2);

    const commsGame = game();
    commsGame.turrets[turret.id] = 0;
    for (const id of PROJECT_IDS) if (id !== "TURRET_EXTRA_FIRERATE") commsGame.projects[id] = PROJECT_COMPLETE;
    commsGame.comms.neron.progress = 0;
    expect(advanceNeron(commsGame, 100)).toBe("TURRET_EXTRA_FIRERATE");
    expect(turretCharges(nextCycle(commsGame), turret.id)).toBe(2);
  });
});
