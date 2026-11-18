import { describe, expect, it } from "vitest";
import { advanceNeron } from "../src/comms.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { interfaceId, patrolShip } from "../src/patrol.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectStatus } from "../src/projects.ts";
import { applyAction, createGame } from "../src/rules.ts";
import type { Action, GameState, Planet } from "../src/types.ts";
import { makeSeats, must, mustApply, option, player, setProgress } from "./support.ts";

const config = DEFAULT_CONFIG;
const LONGANE = patrolShip("PATROL_SHIP_A_0")!;
const PASIPHAE = patrolShip("PATROL_SHIP_AA_1")!;
const patrolTakeoff = (ship = LONGANE): Action => ({ type: "takeoff", equipment: interfaceId(ship) });
const icarusTakeoff: Action = { type: "icarus_takeoff" };
const workCore = (project: string): Action => ({ type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project });

const orbitedPlanet: Planet = {
  id: "planet-1",
  name: "Fugunys",
  direction: "north",
  distance: 3,
  sectors: [{ tag: "FOREST", known: false }],
};

function pilotGame(room: string): GameState {
  const s = createGame(makeSeats(3, "others"), structuredClone(config), 7);
  player(s, "p0").skills.push("pilot");
  player(s, "p0").room = room;
  return s;
}

describe("Takeoff thruster (PATROL_SHIP_LAUNCHER)", () => {
  it("is fully implemented with a 1 AP discount", () => {
    expect(projectStatus("PATROL_SHIP_LAUNCHER")).toBe("full");
    expect([config.patrol.takeoff.cost.ap, config.expedition.cost.ap, config.project.patrolShipLauncher.takeoffApDiscount]).toEqual([2, 4, 1]);
  });

  it("reduces patrol ship and Pasiphae takeoff by 1 AP once complete, and spends the discounted AP", () => {
    const s = pilotGame("SPACESHIP_BAY_A");
    expect(option(s, "p0", patrolTakeoff())!.cost.ap).toBe(config.patrol.takeoff.cost.ap);

    s.projects.PATROL_SHIP_LAUNCHER = PROJECT_COMPLETE - 1;
    expect(option(s, "p0", patrolTakeoff())!.cost.ap).toBe(config.patrol.takeoff.cost.ap);

    s.projects.PATROL_SHIP_LAUNCHER = PROJECT_COMPLETE;
    const expected = config.patrol.takeoff.cost.ap - config.project.patrolShipLauncher.takeoffApDiscount;
    expect(option(s, "p0", patrolTakeoff())!.cost.ap).toBe(expected);

    const apBefore = player(s, "p0").ap;
    const afterPatrol = must(applyAction(s, "p0", patrolTakeoff()));
    expect(player(afterPatrol, "p0").ap).toBe(apBefore - expected);

    // Pasiphae in Alpha Bay 2 uses the same takeoff action
    const bay2 = pilotGame("SPACESHIP_BAY_AA");
    bay2.projects.PATROL_SHIP_LAUNCHER = PROJECT_COMPLETE;
    expect(option(bay2, "p0", patrolTakeoff(PASIPHAE))!.cost.ap).toBe(expected);
    const afterPasiphae = must(applyAction(bay2, "p0", patrolTakeoff(PASIPHAE)));
    expect(player(afterPasiphae, "p0").ap).toBe(player(bay2, "p0").ap - expected);
  });

  it("reduces Icarus expedition takeoff by 1 AP once complete, and spends the discounted AP", () => {
    // Aboard the docked Icarus, suited for a planet with no Oxygen sector.
    const s = pilotGame("ICARUS_CRAFT");
    s.items.push({ id: "suit", type: "space_suit", at: { kind: "player", id: "p0" } });
    s.planets.p0 = [orbitedPlanet];
    s.navigation.orbit = orbitedPlanet.id;
    expect(option(s, "p0", icarusTakeoff)!.cost.ap).toBe(config.expedition.cost.ap);

    s.projects.PATROL_SHIP_LAUNCHER = PROJECT_COMPLETE;
    const expected = config.expedition.cost.ap - config.project.patrolShipLauncher.takeoffApDiscount;
    expect(option(s, "p0", icarusTakeoff)!.cost.ap).toBe(expected);

    const apBefore = player(s, "p0").ap;
    const after = must(applyAction(s, "p0", icarusTakeoff));
    expect(player(after, "p0").ap).toBe(apBefore - expected);
  });

  it("never pushes takeoff cost below 0 AP", () => {
    const custom = structuredClone(config);
    custom.project.patrolShipLauncher.takeoffApDiscount = 5;
    const s = createGame(makeSeats(3, "others"), custom, 7);
    player(s, "p0").skills.push("pilot");
    player(s, "p0").room = "SPACESHIP_BAY_A";
    s.projects.PATROL_SHIP_LAUNCHER = PROJECT_COMPLETE;
    expect(option(s, "p0", patrolTakeoff())!.cost.ap).toBe(0);
  });

  it("activates when worked to 100% at the core or completed by a NERON update", () => {
    const s = pilotGame("NEXUS_ROOM");
    setProgress(s, { project: "PATROL_SHIP_LAUNCHER" }, PROJECT_COMPLETE - 1);
    const done = mustApply(s, "p0", workCore("PATROL_SHIP_LAUNCHER"));
    expect(done.projects.PATROL_SHIP_LAUNCHER).toBe(PROJECT_COMPLETE);
    player(done, "p0").room = "SPACESHIP_BAY_A";
    expect(option(done, "p0", patrolTakeoff())!.cost.ap).toBe(
      config.patrol.takeoff.cost.ap - config.project.patrolShipLauncher.takeoffApDiscount,
    );

    const commsGame = pilotGame("SPACESHIP_BAY_A");
    for (const id of PROJECT_IDS) if (id !== "PATROL_SHIP_LAUNCHER") commsGame.projects[id] = PROJECT_COMPLETE;
    commsGame.comms.neron.progress = 0;
    expect(advanceNeron(commsGame, 100)).toBe("PATROL_SHIP_LAUNCHER");
    expect(option(commsGame, "p0", patrolTakeoff())!.cost.ap).toBe(
      config.patrol.takeoff.cost.ap - config.project.patrolShipLauncher.takeoffApDiscount,
    );
  });
});
