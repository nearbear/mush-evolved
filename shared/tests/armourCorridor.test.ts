import { describe, expect, it } from "vitest";
import { advanceNeron } from "../src/comms.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectStatus } from "../src/projects.ts";
import { createGame } from "../src/rules.ts";
import { damageShip } from "../src/ship.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, noIncidents, player, setProgress } from "./support.ts";

const config = DEFAULT_CONFIG;
const workCore = (project: string): Action => ({ type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project });

function game(shieldOn = false): GameState {
  const s = createGame(makeSeats(3, "others"), structuredClone(config), 7);
  s.bios.plasma_shield = shieldOn;
  return s;
}

describe("Armoured corridors (ARMOUR_CORRIDOR)", () => {
  it("is fully implemented with a 1-point damage reduction", () => {
    expect(projectStatus("ARMOUR_CORRIDOR")).toBe("full");
    expect(config.project.armourCorridor.damageReduction).toBe(1);
  });

  it("does not reduce damage until complete", () => {
    const s = game(false);
    const hullBefore = s.ship.hull;
    damageShip(s, 3);
    expect(s.ship.hull).toBe(hullBefore - 3);

    const almost = game(false);
    almost.projects.ARMOUR_CORRIDOR = PROJECT_COMPLETE - 1;
    damageShip(almost, 3);
    expect(almost.ship.hull).toBe(hullBefore - 3);
  });

  it("reduces incoming attack by 1 before the plasma shield splits it, with a floor of 0", () => {
    // Shield off: 4 -> 3 hull
    const noShield = game(false);
    noShield.projects.ARMOUR_CORRIDOR = PROJECT_COMPLETE;
    damageShip(noShield, 4);
    expect(noShield.ship.hull).toBe(config.ship.hull.start - 3);

    // 1-damage hit -> 0 damage (shield and hull untouched)
    const oneHit = game(true);
    oneHit.projects.ARMOUR_CORRIDOR = PROJECT_COMPLETE;
    damageShip(oneHit, 1);
    expect(oneHit.ship.hull).toBe(config.ship.hull.start);
    expect(oneHit.ship.plasmaShield).toBe(config.ship.plasmaShield.start);

    // Shield on (33%): 4 -> 3 effective -> round(3 * 0.33) = 1 shield, 2 hull
    const withShield = game(true);
    withShield.projects.ARMOUR_CORRIDOR = PROJECT_COMPLETE;
    damageShip(withShield, 4);
    expect(withShield.ship.plasmaShield).toBe(config.ship.plasmaShield.start - 1);
    expect(withShield.ship.hull).toBe(config.ship.hull.start - 2);

    // Shield on + PLASMA_SHIELD (67%): 4 -> 3 effective -> round(3 * 0.67) = 2 shield, 1 hull
    const withPlasma = game(true);
    withPlasma.projects.ARMOUR_CORRIDOR = PROJECT_COMPLETE;
    withPlasma.projects.PLASMA_SHIELD = PROJECT_COMPLETE;
    damageShip(withPlasma, 4);
    expect(withPlasma.ship.plasmaShield).toBe(config.ship.plasmaShield.start - 2);
    expect(withPlasma.ship.hull).toBe(config.ship.hull.start - 1);
  });

  it("reduces asteroid impact damage on the Daedalus", () => {
    const s = noIncidents(game(false));
    s.projects.ARMOUR_CORRIDOR = PROJECT_COMPLETE;
    s.hunters.list.push({
      id: "ast-1",
      type: "asteroid",
      hp: 5,
      hitChance: 1,
      target: null,
      countdown: 1,
    });
    const hullBefore = s.ship.hull;
    const after = nextCycle(s);
    expect(after.hunters.list.some((h) => h.id === "ast-1")).toBe(false);
    expect(after.ship.hull).toBe(hullBefore - (5 - config.project.armourCorridor.damageReduction));
  });

  it("activates when worked to 100% at the core or completed by a NERON update", () => {
    const s = game(false);
    player(s, "p0").room = "NEXUS_ROOM";
    setProgress(s, { project: "ARMOUR_CORRIDOR" }, PROJECT_COMPLETE - 1);
    const done = mustApply(s, "p0", workCore("ARMOUR_CORRIDOR"));
    expect(done.projects.ARMOUR_CORRIDOR).toBe(PROJECT_COMPLETE);
    const hullBefore = done.ship.hull;
    damageShip(done, 3);
    expect(done.ship.hull).toBe(hullBefore - 2);

    const commsGame = game(false);
    for (const id of PROJECT_IDS) if (id !== "ARMOUR_CORRIDOR") commsGame.projects[id] = PROJECT_COMPLETE;
    commsGame.comms.neron.progress = 0;
    expect(advanceNeron(commsGame, 100)).toBe("ARMOUR_CORRIDOR");
    const commsHull = commsGame.ship.hull;
    damageShip(commsGame, 3);
    expect(commsGame.ship.hull).toBe(commsHull - 2);
  });
});
