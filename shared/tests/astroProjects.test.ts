import { describe, expect, it } from "vitest";
import { advanceNeron } from "../src/comms.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { PROJECT_COMPLETE, PROJECT_IDS, projectStatus } from "../src/projects.ts";
import { applyAction, createGame } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, must, mustApply, option, player, setProgress } from "./support.ts";

const config = DEFAULT_CONFIG;
const terminal = "COMMAND_CENTER:ASTRO_MODULE";
const scan = { type: "scan_planet", equipment: terminal } as const;

function game(): GameState {
  const s = createGame(makeSeats(3, "others"), structuredClone(config), 7);
  for (const p of s.players) p.room = "COMMAND_CENTER";
  return s;
}

const workCore = (project: string): Action => ({ type: "project", equipment: "NEXUS_ROOM:NERON_CORE", project });

const mkPlanet = (id: string) =>
  ({
    id,
    name: "Astra",
    position: { direction: "N", distance: 2 },
    sectors: ["FOREST", "MOUNTAIN", "SWAMP", "DESERT", "OCEAN", "HYDROCARBON"].map((tag) => ({ tag, known: false })),
  }) as never;

describe("Quantum Sensors and CPU Overclocking projects", () => {
  it("are fully implemented (owner, 2026-11-01)", () => {
    expect(projectStatus("QUANTUM_SENSORS")).toBe("full");
    expect(projectStatus("CHIPSET_ACCELERATION")).toBe("full");
  });

  describe("CPU Overclocking (CHIPSET_ACCELERATION)", () => {
    it("reduces Scan for planets cost by 1 AP (from 3 to 2 AP), and stacks with Astrophysicist to 1 AP", () => {
      const s = game();
      player(s, "p1").skills.push("astrophysician");

      // Before completion
      expect(option(s, "p0", scan)!.cost.ap).toBe(config.astro.scan.cost.ap);
      expect(option(s, "p1", scan)!.cost.ap).toBe(config.astro.scan.cost.ap - config.astrophysicist.scanApDiscount);

      // Complete CPU Overclocking
      s.projects.CHIPSET_ACCELERATION = PROJECT_COMPLETE;

      expect(option(s, "p0", scan)!.cost.ap).toBe(config.astro.scan.cost.ap - config.project.chipsetAcceleration.scanApDiscount);
      expect(option(s, "p1", scan)!.cost.ap).toBe(
        config.astro.scan.cost.ap - config.astrophysicist.scanApDiscount - config.project.chipsetAcceleration.scanApDiscount,
      );

      // Costs are 2 AP and 1 AP
      expect([option(s, "p0", scan)!.cost.ap, option(s, "p1", scan)!.cost.ap]).toEqual([2, 1]);

      // Spending AP matches the discounted cost
      const apBefore = player(s, "p0").ap;
      const after = must(applyAction(s, "p0", scan));
      expect(player(after, "p0").ap).toBe(apBefore - 2);
    });

    it("does not reduce scan cost while project is incomplete", () => {
      const s = game();
      s.projects.CHIPSET_ACCELERATION = PROJECT_COMPLETE - 1;
      expect(option(s, "p0", scan)!.cost.ap).toBe(config.astro.scan.cost.ap);
    });

    it("activates when worked to 100% at the core or when completed by a NERON update", () => {
      const s = game();
      for (const p of s.players) p.room = "NEXUS_ROOM";
      setProgress(s, { project: "CHIPSET_ACCELERATION" }, PROJECT_COMPLETE - 1);
      const done = mustApply(s, "p0", workCore("CHIPSET_ACCELERATION"));
      expect(done.projects.CHIPSET_ACCELERATION).toBe(PROJECT_COMPLETE);

      for (const p of done.players) p.room = "COMMAND_CENTER";
      expect(option(done, "p0", scan)!.cost.ap).toBe(2);

      // Comms NERON update completion
      const commsGame = game();
      for (const id of PROJECT_IDS) if (id !== "CHIPSET_ACCELERATION") commsGame.projects[id] = PROJECT_COMPLETE;
      commsGame.comms.neron.progress = 0;
      expect(advanceNeron(commsGame, 100)).toBe("CHIPSET_ACCELERATION");
      expect(option(commsGame, "p0", scan)!.cost.ap).toBe(2);
    });
  });

  describe("Quantum Sensors (QUANTUM_SENSORS)", () => {
    it("pins config values to +30% scan chance and +1 analysis sector", () => {
      expect([config.project.quantumSensors.scanChanceBonus, config.project.quantumSensors.extraSectors]).toEqual([0.3, 1]);
    });

    it("adds +30% scan chance (capped at 100%) while the Motor Room planet scanner is unbroken", () => {
      const s = game();
      expect(option(s, "p0", scan)!.chance).toBeCloseTo(config.astro.scan.chance);

      s.projects.QUANTUM_SENSORS = PROJECT_COMPLETE;
      expect(option(s, "p0", scan)!.chance).toBeCloseTo(Math.min(1, config.astro.scan.chance + config.project.quantumSensors.scanChanceBonus));

      // Also verify non-capped addition with a lower base scan chance.
      const low = createGame(makeSeats(3, "others"), { ...structuredClone(config), astro: { ...structuredClone(config.astro), scan: { ...config.astro.scan, chance: 0.5 } } }, 7);
      for (const p of low.players) p.room = "COMMAND_CENTER";
      low.projects.QUANTUM_SENSORS = PROJECT_COMPLETE;
      expect(option(low, "p0", scan)!.chance).toBeCloseTo(0.5 + config.project.quantumSensors.scanChanceBonus);
    });

    it("reveals 1 extra sector per analysis (2 sectors total), stacking with Astrophysicist (3 sectors)", () => {
      const s = game();
      player(s, "p1").skills.push("astrophysician");
      s.planets.p0 = [mkPlanet("pl-0")];
      s.planets.p1 = [mkPlanet("pl-1")];

      // Before completion: 1 sector for p0, 2 sectors for p1 (astrophysician)
      const a0 = must(applyAction(s, "p0", { type: "analyze_planet", equipment: terminal, planet: "pl-0" }));
      const a1 = must(applyAction(s, "p1", { type: "analyze_planet", equipment: terminal, planet: "pl-1" }));
      expect(a0.planets.p0![0]!.sectors.filter((x) => x.known)).toHaveLength(1);
      expect(a1.planets.p1![0]!.sectors.filter((x) => x.known)).toHaveLength(2);

      // Once completed: +1 extra sector to both
      s.projects.QUANTUM_SENSORS = PROJECT_COMPLETE;
      const b0 = must(applyAction(s, "p0", { type: "analyze_planet", equipment: terminal, planet: "pl-0" }));
      const b1 = must(applyAction(s, "p1", { type: "analyze_planet", equipment: terminal, planet: "pl-1" }));
      expect(b0.planets.p0![0]!.sectors.filter((x) => x.known)).toHaveLength(2);
      expect(b1.planets.p1![0]!.sectors.filter((x) => x.known)).toHaveLength(3);
    });

    it("stacks with deep analysis in orbit (3 sectors for normal player, 4 for Astrophysicist)", () => {
      const s = game();
      player(s, "p1").skills.push("astrophysician");
      s.planets.p0 = [mkPlanet("orbit-0")];
      s.planets.p1 = [mkPlanet("orbit-1")];
      s.navigation.orbit = "orbit-0";
      s.projects.QUANTUM_SENSORS = PROJECT_COMPLETE;

      const deep0 = must(applyAction(s, "p0", { type: "analyze_planet", equipment: terminal, planet: "orbit-0" }));
      // 1 base + 1 orbit + 1 quantum = 3
      expect(deep0.planets.p0![0]!.sectors.filter((x) => x.known)).toHaveLength(3);

      s.navigation.orbit = "orbit-1";
      const deep1 = must(applyAction(s, "p1", { type: "analyze_planet", equipment: terminal, planet: "orbit-1" }));
      // 1 base + 1 orbit + 1 astrophysicist + 1 quantum = 4
      expect(deep1.planets.p1![0]!.sectors.filter((x) => x.known)).toHaveLength(4);
    });

    it("does not apply scan or analysis bonuses while the Motor Room planet scanner is broken, and restores them when repaired", () => {
      const s = game();
      s.projects.QUANTUM_SENSORS = PROJECT_COMPLETE;
      s.planets.p0 = [mkPlanet("pl-broken")];

      const scanner = (s.equipment.MOTOR_ROOM ?? []).find((e) => e.type === "PLANET_SCANNER")!;
      expect(scanner).toBeDefined();
      scanner.broken = true;

      expect(option(s, "p0", scan)!.chance).toBeCloseTo(config.astro.scan.brokenScannerChance);
      const res = must(applyAction(s, "p0", { type: "analyze_planet", equipment: terminal, planet: "pl-broken" }));
      expect(res.planets.p0![0]!.sectors.filter((x) => x.known)).toHaveLength(1);

      // Repairing the scanner restores both bonuses.
      scanner.broken = false;
      expect(option(s, "p0", scan)!.chance).toBeCloseTo(Math.min(1, config.astro.scan.chance + config.project.quantumSensors.scanChanceBonus));
      const repaired = must(applyAction(s, "p0", { type: "analyze_planet", equipment: terminal, planet: "pl-broken" }));
      expect(repaired.planets.p0![0]!.sectors.filter((x) => x.known)).toHaveLength(2);
    });
  });
});
