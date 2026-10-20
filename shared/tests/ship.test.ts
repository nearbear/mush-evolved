import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { createGame, newCycle, viewFor } from "../src/rules.ts";
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
    expect(s.ship).toEqual({ oxygen: 30, fuel: 20, hull: 100, plasmaShield: 100 });
    expect(viewFor(s, "p0").ship).toEqual({ ...s.ship, max: { oxygen: 32, fuel: 100, hull: 100, plasmaShield: 100 } });
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

  it("stops killing when nobody is left alive", () => {
    let s = game();
    s.ship.oxygen = 0;
    for (let i = 0; i < 6; i++) s = cycle(s);
    expect(s.players.every((p) => !p.alive)).toBe(true);
  });

  it("splits damage 67% to the shield (rounded down) and the rest to the hull", () => {
    const s = game();
    damageShip(s, 10);
    expect(s.ship).toMatchObject({ plasmaShield: 94, hull: 96 });
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
