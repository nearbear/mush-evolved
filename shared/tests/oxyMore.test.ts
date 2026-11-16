import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PROJECT_COMPLETE, PROJECT_STATUS } from "../src/projects.ts";
import { applyInput } from "../src/replay.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { GameConfig, GameState } from "../src/types.ts";
import { makeSeats, must, setProgress } from "./support.ts";

const globalSystem = (s: Readonly<GameState>) => s.chat.filter((m) => m.channel === "global" && m.system !== undefined).map((m) => m.system);

function ship(oxyMore?: Partial<GameConfig["project"]["oxyMore"]>): GameState {
  const config: GameConfig = {
    ...DEFAULT_CONFIG,
    incidents: { ...DEFAULT_CONFIG.incidents, pointsByDay: [], laterAdditionFromDay: 999, majorAdditionFromDay: 999 },
    project: { ...DEFAULT_CONFIG.project, oxyMore: { ...DEFAULT_CONFIG.project.oxyMore, ...oxyMore } },
    fire: { ...DEFAULT_CONFIG.fire, spreadChance: 0, breakChance: 0, hullChance: 0 },
  };
  return createGame(makeSeats(3, "others"), config, 7);
}

function breakOneOxygenTank(state: GameState): void {
  const tank = Object.values(state.equipment).flat().find((e) => e.type === "OXYGEN_TANK");
  if (!tank) throw new Error("expected an OXYGEN_TANK in the starting ship");
  tank.broken = true;
}

describe("Oxygenated ducts (OXY_MORE)", () => {
  it("uses the confirmed config values and marks the project full", () => {
    expect(DEFAULT_CONFIG.project.oxyMore).toEqual({ saveChance: 0.2 });
    expect(PROJECT_STATUS.OXY_MORE).toBe("full");
  });

  it("does nothing before the project is complete", () => {
    const s = ship({ saveChance: 1 });
    setProgress(s, { project: "OXY_MORE" }, PROJECT_COMPLETE - 1);
    breakOneOxygenTank(s);
    const startOxygen = s.ship.oxygen;

    const after = must(applyInput(s, { type: "cycle", at: 0 }));
    expect(after.ship.oxygen).toBe(startOxygen - s.config.ship.oxygen.perCycle - s.config.repair.oxygenLeak);
    expect(globalSystem(after).filter((m) => m?.key === "oxygenSavedDucts")).toHaveLength(0);
  });

  it("prevents both cycle burn and broken oxygen tank leaks when the roll succeeds, announced globally", () => {
    const s = ship({ saveChance: 1 });
    setProgress(s, { project: "OXY_MORE" }, PROJECT_COMPLETE);
    breakOneOxygenTank(s);
    const startOxygen = s.ship.oxygen;

    const after = must(applyInput(s, { type: "cycle", at: 0 }));
    expect(after.ship.oxygen).toBe(startOxygen);
    const messages = globalSystem(after).filter((m) => m?.key === "oxygenSavedDucts");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ key: "oxygenSavedDucts" });
    expect(viewFor(after, "p0").chat.some((m) => m.system?.key === "oxygenSavedDucts")).toBe(true);
  });

  it("loses oxygen normally and stays silent when the roll fails", () => {
    const s = ship({ saveChance: 0 });
    setProgress(s, { project: "OXY_MORE" }, PROJECT_COMPLETE);
    breakOneOxygenTank(s);
    const startOxygen = s.ship.oxygen;

    const after = must(applyInput(s, { type: "cycle", at: 0 }));
    expect(after.ship.oxygen).toBe(startOxygen - s.config.ship.oxygen.perCycle - s.config.repair.oxygenLeak);
    expect(globalSystem(after).filter((m) => m?.key === "oxygenSavedDucts")).toHaveLength(0);
  });

  it("still causes asphyxia death if oxygen is already at 0 when it triggers", () => {
    const s = ship({ saveChance: 1 });
    setProgress(s, { project: "OXY_MORE" }, PROJECT_COMPLETE);
    s.ship.oxygen = 0;

    const after = must(applyInput(s, { type: "cycle", at: 0 }));
    expect(after.ship.oxygen).toBe(0);
    expect(after.players.filter((p) => !p.alive)).toHaveLength(1);
    expect(after.log.some((e) => e.key === "oxygenOut")).toBe(true);
    expect(globalSystem(after).filter((m) => m?.key === "oxygenSavedDucts")).toHaveLength(1);
  });

  it("still rolls and prevents broken tank leaks when the invincible cheat is active", () => {
    const s = ship({ saveChance: 1 });
    setProgress(s, { project: "OXY_MORE" }, PROJECT_COMPLETE);
    breakOneOxygenTank(s);
    s.players[0]!.cheats.push("invincible");
    const startOxygen = s.ship.oxygen;

    const after = must(applyInput(s, { type: "cycle", at: 0 }));
    expect(after.ship.oxygen).toBe(startOxygen);
    expect(globalSystem(after).filter((m) => m?.key === "oxygenSavedDucts")).toHaveLength(1);
  });
});
