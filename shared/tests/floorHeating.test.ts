import { describe, expect, it } from "vitest";
import { advanceNeron } from "../src/comms.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectStatus } from "../src/projects.ts";
import { createGame } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, mustApply, noIncidents, offered, option, player, setProgress } from "./support.ts";

const config = DEFAULT_CONFIG;
const workCore = (project: string): Action => ({ type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project });

function game(seed = 7): GameState {
  const s = noIncidents(createGame(makeSeats(4, "others"), structuredClone(config), seed));
  player(s, "p0").skills = ["fireman"];
  player(s, "p1").skills = ["fireman", "expert"];
  player(s, "p2").role = "mush";
  player(s, "p2").skills = ["fireman"];
  for (const id of ["p0", "p1", "p2"]) {
    player(s, id).room = "NEXUS_ROOM";
  }
  s.fires = ["NEXUS_ROOM"];
  // Remove extinguishers so manual extinguish (50% base injury chance) is offered.
  s.items = s.items.filter((i) => i.type !== "extinguisher");
  return s;
}

const manualFireInjury = (s: GameState, id: string) => option(s, id, { type: "extinguish_manually" })!.injury;

describe("Floor heating (FLOOR_HEATING)", () => {
  it("is fully implemented with a 0.5 injury multiplier", () => {
    expect(projectStatus("FLOOR_HEATING")).toBe("full");
    expect(config.project.floorHeating.injuryFactor).toBe(0.5);
    expect(config.extinguish.firefighterInjuryChance).toBe(0.5);
  });

  it("does not reduce action injury chance until complete", () => {
    const s = game();
    expect(manualFireInjury(s, "p0")).toBeCloseTo(config.extinguish.firefighterInjuryChance);

    const almost = game();
    almost.projects.FLOOR_HEATING = PROJECT_COMPLETE - 1;
    expect(manualFireInjury(almost, "p0")).toBeCloseTo(config.extinguish.firefighterInjuryChance);
  });

  it("halves action injury chance for everyone (humans and Mush) and stacks with Expert", () => {
    const s = game();
    const factor = config.project.floorHeating.injuryFactor;

    s.projects.FLOOR_HEATING = PROJECT_COMPLETE;
    expect(manualFireInjury(s, "p0")).toBeCloseTo(config.extinguish.firefighterInjuryChance * factor);
    expect(manualFireInjury(s, "p2")).toBeCloseTo(config.extinguish.firefighterInjuryChance * factor);
    expect(manualFireInjury(s, "p1")).toBeCloseTo(config.extinguish.firefighterInjuryChance * 1.2 * factor);
  });

  it("leaves zero-injury actions at zero", () => {
    const s = game();
    s.projects.FLOOR_HEATING = PROJECT_COMPLETE;
    const moves = offered(s, "p0", "move");
    expect(moves.length).toBeGreaterThan(0);
    expect(option(s, "p0", moves[0]!)!.injury).toBe(0);
  });

  it("reduces actual injuries rolled when performing actions", () => {
    let baseInjuries = 0;
    let heatedInjuries = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s0 = game(seed);
      const hpBefore = player(s0, "p0").hp;
      const afterBase = mustApply(s0, "p0", { type: "extinguish_manually" });
      if (player(afterBase, "p0").hp < hpBefore) baseInjuries += 1;

      const s1 = game(seed);
      s1.projects.FLOOR_HEATING = PROJECT_COMPLETE;
      const afterHeated = mustApply(s1, "p0", { type: "extinguish_manually" });
      if (player(afterHeated, "p0").hp < hpBefore) heatedInjuries += 1;
    }
    expect(baseInjuries).toBeGreaterThan(heatedInjuries);
    expect(heatedInjuries).toBeGreaterThan(0);
  });

  it("activates when worked to 100% at the core or completed by a NERON update", () => {
    const s = game();
    s.projectDeck = ["FLOOR_HEATING", ...s.projectDeck.filter((id) => id !== "FLOOR_HEATING")];
    setProgress(s, { project: "FLOOR_HEATING" }, PROJECT_COMPLETE - 1);

    const done = mustApply(s, "p0", workCore("FLOOR_HEATING"));
    expect(done.projects.FLOOR_HEATING).toBe(PROJECT_COMPLETE);
    expect(manualFireInjury(done, "p0")).toBeCloseTo(config.extinguish.firefighterInjuryChance * config.project.floorHeating.injuryFactor);

    const commsGame = game();
    for (const id of PROJECT_IDS) if (id !== "FLOOR_HEATING") commsGame.projects[id] = PROJECT_COMPLETE;
    commsGame.comms.neron.progress = 0;
    expect(advanceNeron(commsGame, 100)).toBe("FLOOR_HEATING");
    expect(manualFireInjury(commsGame, "p0")).toBeCloseTo(config.extinguish.firefighterInjuryChance * config.project.floorHeating.injuryFactor);
  });
});
