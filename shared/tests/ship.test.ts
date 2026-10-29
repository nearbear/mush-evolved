import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { createGame, newCycle, viewFor } from "../src/rules.ts";
import { PROJECT_COMPLETE } from "../src/projects.ts";
import { damageShip } from "../src/ship.ts";
import { makeSeats } from "./support.ts";

const game = () => createGame(makeSeats(4, "others"), DEFAULT_CONFIG, 7);
const cycle = (s: ReturnType<typeof game>) => {
  const r = newCycle(s);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe("ship resources", () => {
  it("start at the decided values and are public", () => {
    const s = game();
    expect(s.ship).toEqual({ oxygen: 30, fuel: 20, combustion: 0, hull: 100, plasmaShield: 50 });
    expect(viewFor(s, "p0").ship).toEqual({ oxygen: s.ship.oxygen, fuel: s.ship.fuel, hull: s.ship.hull, plasmaShield: s.ship.plasmaShield, max: { oxygen: 32, fuel: 100, hull: 100, plasmaShield: 100 } });
    expect(viewFor(s, "p3").ship).toEqual(viewFor(s, "p0").ship);
  });

  it("burns one oxygen per cycle and kills nobody while any is left", () => {
    const s = cycle(game());
    expect(s.ship.oxygen).toBe(29);
    expect(s.players.every((p) => p.alive)).toBe(true);
  });

  it("kills one random living player per cycle once oxygen is at 0, after a cycle of grace", () => {
    let s = game();
    s.ship.oxygen = 1;
    s = cycle(s);
    expect(s.ship.oxygen).toBe(0);
    expect(s.players.filter((p) => !p.alive)).toHaveLength(0);
    s = cycle(s);
    expect(s.players.filter((p) => !p.alive)).toHaveLength(1);
    expect(s.ship.oxygen).toBe(0);
    s = cycle(s);
    expect(s.players.filter((p) => !p.alive)).toHaveLength(2);
    expect(s.log.filter((e) => e.key === "oxygenOut")).toHaveLength(2);
  });

  it("ends the game for the Mush when the last human suffocates", () => {
    let s = game();
    s.ship.oxygen = 0;
    for (let i = 0; i < 6 && s.phase === "playing"; i++) s = cycle(s);
    expect([s.phase, s.winner]).toEqual(["ended", "mush"]);
    expect(newCycle(s)).toEqual({ ok: false, error: "game_over" });
  });

  it("splits damage 33% to the shield (rounded) and the rest to the hull", () => {
    const s = game();
    expect([s.config.ship.plasmaShield.absorbPercent, s.config.ship.plasmaShield.projectAbsorbPercent, s.config.ship.plasmaShield.regen]).toEqual([33, 67, 5]);
    damageShip(s, 10);
    expect(s.ship).toMatchObject({ plasmaShield: 47, hull: 93 });
    damageShip(s, 2);
    expect(s.ship).toMatchObject({ plasmaShield: 46, hull: 92 });
  });

  it("splits 67% to the shield once the Plasma Shield project is done", () => {
    const s = game();
    s.projects.PLASMA_SHIELD = PROJECT_COMPLETE;
    damageShip(s, 10);
    expect(s.ship).toMatchObject({ plasmaShield: 43, hull: 97 });
  });

  it("sends all damage to the hull while the BIOS has the shield off, and shows the shield as 0", () => {
    const s = game();
    s.bios.plasma_shield = false;
    damageShip(s, 10);
    expect(s.ship).toMatchObject({ plasmaShield: 50, hull: 90 });
    expect(viewFor(s, "p0").ship.plasmaShield).toBe(0);
    s.bios.plasma_shield = true;
    expect(viewFor(s, "p0").ship.plasmaShield).toBe(50);
  });

  it("sends all damage to the hull once the shield is gone, and never goes below 0", () => {
    const s = game();
    s.ship.plasmaShield = 3;
    damageShip(s, 10);
    expect(s.ship).toMatchObject({ plasmaShield: 0, hull: 93 });
    damageShip(s, 200);
    expect(s.ship.hull).toBe(0);
  });
});
