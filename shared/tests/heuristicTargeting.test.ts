import { describe, expect, it } from "vitest";
import { advanceNeron } from "../src/comms.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { patrolShip } from "../src/patrol.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectStatus } from "../src/projects.ts";
import { createGame } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, mustApply, noIncidents, option, player, setProgress } from "./support.ts";

const config = DEFAULT_CONFIG;
const TURRET_ROOM = "LASER_TURRET_A_0";
const LONGANE = patrolShip("PATROL_SHIP_A_0")!;
const workCore = (project: string): Action => ({ type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project });

function game(): GameState {
  const s = noIncidents(createGame(makeSeats(4, "others"), structuredClone(config), 7));
  s.hunters.list = [{ id: "h1", kind: "hunter", hp: 10, target: null, missStreak: 0 }];
  player(s, "p0").skills = [];
  player(s, "p1").skills = ["gunner"];
  player(s, "p2").skills = ["pilot"];
  player(s, "p3").role = "mush";
  player(s, "p3").skills = [];
  player(s, "p0").room = TURRET_ROOM;
  player(s, "p1").room = TURRET_ROOM;
  player(s, "p3").room = TURRET_ROOM;
  // Put p2 in a flying patrol ship.
  player(s, "p2").room = LONGANE.id;
  s.patrolShips[LONGANE.id]!.out = true;
  return s;
}

const turretChance = (s: GameState, id: string) => option(s, id, { type: "turret_attack" })!.chance;
const patrolChance = (s: GameState, id: string) => option(s, id, { type: "patrol_attack" })!.chance;

describe("Heuristic targeting (NERON_TARGETING_ASSIST)", () => {
  it("is fully implemented with a 1.25 accuracy multiplier", () => {
    expect(projectStatus("NERON_TARGETING_ASSIST")).toBe("full");
    expect(config.project.neronTargetingAssist.accuracyFactor).toBe(1.25);
    expect(config.turrets.chance).toBe(0.3);
    expect(config.patrol.shot.chance).toBe(0.4);
  });

  it("does not change turret or patrol aim until complete", () => {
    const s = game();
    expect(turretChance(s, "p0")).toBeCloseTo(config.turrets.chance);
    expect(patrolChance(s, "p2")).toBeCloseTo(config.patrol.shot.chance * config.patrol.shot.pilotAccuracyFactor);

    const almost = game();
    almost.projects.NERON_TARGETING_ASSIST = PROJECT_COMPLETE - 1;
    expect(turretChance(almost, "p0")).toBeCloseTo(config.turrets.chance);
    expect(patrolChance(almost, "p2")).toBeCloseTo(config.patrol.shot.chance * config.patrol.shot.pilotAccuracyFactor);
  });

  it("raises turret and patrol ship aim by 25% for everyone (humans and Mush), stacking with skills and streaks up to 99%", () => {
    const s = game();
    s.projects.NERON_TARGETING_ASSIST = PROJECT_COMPLETE;
    const factor = config.project.neronTargetingAssist.accuracyFactor;

    // Plain human and Mush at a turret both get x1.25.
    expect(turretChance(s, "p0")).toBeCloseTo(config.turrets.chance * factor);
    expect(turretChance(s, "p3")).toBeCloseTo(config.turrets.chance * factor);

    // Gunner stacks multiplicatively (0.3 * 2 * 1.25 = 0.75).
    expect(turretChance(s, "p1")).toBeCloseTo(config.turrets.chance * config.gunner.accuracyFactor * factor);

    // Failure streak stacks multiplicatively.
    s.failureStreaks.p0 = { turret_attack: 2 };
    expect(turretChance(s, "p0")).toBeCloseTo(config.turrets.chance * config.turrets.failureMultiplier ** 2 * factor);

    // Non-pilot in a patrol ship gets 0.4 * 1.25 = 0.5; Pilot gets 0.4 * 2 * 1.25 = 1.0, capped at 0.99.
    expect(patrolChance(s, "p2")).toBe(0.99);
    player(s, "p2").skills = [];
    expect(patrolChance(s, "p2")).toBeCloseTo(config.patrol.shot.chance * factor);
  });

  it("does not affect other actions like repairs or ground attacks", () => {
    const s = game();
    player(s, "p0").room = "NEXUS_ROOM";
    player(s, "p1").room = "NEXUS_ROOM";
    s.equipment.NEXUS_ROOM![0]!.broken = true;
    s.items.push({ id: "w1", type: "knife", at: { kind: "player", id: "p0" } });
    const baseRepair = option(s, "p0", { type: "repair" })!.chance;
    const baseAttack = option(s, "p0", { type: "attack" })!.chance;

    s.projects.NERON_TARGETING_ASSIST = PROJECT_COMPLETE;
    expect(option(s, "p0", { type: "repair" })!.chance).toBe(baseRepair);
    expect(option(s, "p0", { type: "attack" })!.chance).toBe(baseAttack);
  });

  it("activates when worked to 100% at the core or completed by a NERON update", () => {
    const s = game();
    player(s, "p0").room = "NEXUS_ROOM";
    setProgress(s, { project: "NERON_TARGETING_ASSIST" }, PROJECT_COMPLETE - 1);

    const done = mustApply(s, "p0", workCore("NERON_TARGETING_ASSIST"));
    expect(done.projects.NERON_TARGETING_ASSIST).toBe(PROJECT_COMPLETE);
    expect(turretChance(done, "p1")).toBeCloseTo(config.turrets.chance * config.gunner.accuracyFactor * config.project.neronTargetingAssist.accuracyFactor);

    const commsGame = game();
    for (const id of PROJECT_IDS) if (id !== "NERON_TARGETING_ASSIST") commsGame.projects[id] = PROJECT_COMPLETE;
    commsGame.comms.neron.progress = 0;
    expect(advanceNeron(commsGame, 100)).toBe("NERON_TARGETING_ASSIST");
    expect(turretChance(commsGame, "p1")).toBeCloseTo(config.turrets.chance * config.gunner.accuracyFactor * config.project.neronTargetingAssist.accuracyFactor);
  });
});
