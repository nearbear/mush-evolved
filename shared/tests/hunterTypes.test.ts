// The other hunter kinds (owner, 2026-11-12, #388; eMush's numbers): the Arack, the asteroid, the D1000 and the Trax.

import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { ARACK_AROUND } from "../src/actions/action.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { damageHunter, huntersCycle, newHunter } from "../src/hunters.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { type Action, type GameConfig, type GameState, HUNTER_TYPES, type HunterType } from "../src/types.ts";
import { type DeepPartial, makeSeats, must, option, player, testConfig } from "./support.ts";

const TURRET_ROOM = "LASER_TURRET_A_0";
const TERMINAL = "COMMAND_CENTER:PILOT_MODULE";
const travel: Action = { type: "travel", equipment: TERMINAL };
const leave: Action = { type: "leave_orbit", equipment: TERMINAL };
const refusal = (s: GameState, id: string, action: Action) => ACTIONS[action.type]!.check(s, player(s, id), action);

/** p0 the Commander at the Command terminal with fuel loaded, p1 at a turret, p2 in the lab; no waves; the given hunters. */
function ship(types: HunterType[] = [], config: DeepPartial<GameConfig> = {}): GameState {
  const s = createGame(makeSeats(3), testConfig(config), 3);
  player(s, "p0").room = "COMMAND_CENTER";
  s.titles.commander = "p0";
  s.ship.combustion = 2;
  player(s, "p1").room = TURRET_ROOM;
  player(s, "p2").room = "LABORATORY";
  for (const type of types) s.hunters.list.push(newHunter(s, type));
  return s;
}

/** A state ready for a wave at the next `huntersCycle`: certain to roll, past the safe cycles, with `points` in the pool. */
function waveReady(seed: number, points: number): GameState {
  const s = createGame(makeSeats(3), testConfig({ hunters: { waveChance: 1 } }), seed);
  s.hunters.since = s.cycle - 100;
  s.hunters.points = points;
  return s;
}

const count = (s: GameState, type: HunterType) => s.hunters.list.filter((h) => h.type === type).length;

describe("hunter kinds", () => {
  it("eMush's numbers: hp, damage, aim, actions, armor, cost, weight, first day, cap, following and countdown", () => {
    const row = (t: HunterType) => {
      const k = DEFAULT_CONFIG.hunters.types[t];
      return [k.hp, k.damage, k.hitChance, k.actions, k.armor, k.cost, k.weight, k.fromDay, k.maxPerWave, k.follows, k.countdown];
    };
    expect(HUNTER_TYPES.map(row)).toEqual([
      [6, [2, 4], 0.8, 1, 0, 10, 10, 1, null, "share", null],
      [6, [1, 3], 0.4, 1, 0, 20, 1, 5, 2, "share", null],
      [20, [0, 0], 1, 0, 0, 25, 1, 5, 2, "never", 6],
      [30, [3, 6], 0.6, 3, 1, 30, 1, 10, 1, "never", null],
      [10, [2, 3], 0.5, 1, 0, 20, 2, 5, 2, "all", null],
    ]);
  });
});

describe("debris by kind (owner, 2026-11-21, #422)", () => {
  it("eMush's tables: weights by piece count (index = count) and by item", () => {
    const { types } = DEFAULT_CONFIG.hunters;
    expect(HUNTER_TYPES.map((t) => types[t].debris)).toEqual([
      { count: [0, 2, 1], types: { metal_scraps: 2, space_capsule: 1, plastic_scraps: 1 } },
      { count: [0, 2, 1], types: { metal_scraps: 2, space_capsule: 2, plastic_scraps: 1 } },
      { count: [0, 2, 1, 1], types: { metal_scraps: 2, space_capsule: 1 } },
      { count: [0, 2, 1, 1, 1], types: { metal_scraps: 2, space_capsule: 2, plastic_scraps: 1 } },
      { count: [0, 2, 1, 1], types: { metal_scraps: 2, space_capsule: 1, plastic_scraps: 1 } },
    ]);
  });

  it("a kind shot down leaves its own table's debris: every piece count it allows, only its items", () => {
    for (const type of HUNTER_TYPES) {
      const table = DEFAULT_CONFIG.hunters.types[type].debris;
      const counts = new Set<number>();
      for (let seed = 1; seed <= 120; seed++) {
        const s = createGame(makeSeats(3), testConfig(), seed);
        const hunter = newHunter(s, type);
        s.hunters.list.push(hunter);
        expect(damageHunter(s, hunter.id, hunter.hp + 1)).toBe(true);
        counts.add(s.space.length);
        for (const d of s.space) expect(table.types[d.type]).toBeGreaterThan(0);
      }
      const allowed = table.count.flatMap((w, n) => (w > 0 ? [n] : []));
      expect([...counts].sort()).toEqual(allowed);
    }
  });

  it("the asteroid never leaves plastic scraps", () => {
    const s = ship(["asteroid"], { hunters: { types: { asteroid: { debris: { count: [0, 0, 0, 1] } } } } });
    const id = s.hunters.list[0]!.id;
    damageHunter(s, id, 100);
    expect(s.space).toHaveLength(3);
    expect(s.space.some((d) => d.type === "plastic_scraps")).toBe(false);
  });
});

describe("a wave's kinds", () => {
  it("before day 5 a wave is all plain hunters", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = waveReady(seed, 200);
      huntersCycle(s, 4);
      expect(s.hunters.list.length).toBeGreaterThan(0);
      expect(s.hunters.list.every((h) => h.type === "hunter")).toBe(true);
    }
  });

  it("from day 5 it draws the Arack, asteroid and Trax too (at most 2 of each), never a D1000, and spends until under 10 points", () => {
    const seen = new Set<HunterType>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const s = waveReady(seed, 300);
      huntersCycle(s, 5);
      for (const type of ["spider", "asteroid", "trax"] as const) expect(count(s, type)).toBeLessThanOrEqual(2);
      expect(count(s, "dice")).toBe(0);
      expect(s.hunters.points).toBeLessThan(DEFAULT_CONFIG.hunters.types.hunter.cost);
      for (const h of s.hunters.list) seen.add(h.type);
    }
    expect([...seen].sort()).toEqual(["asteroid", "hunter", "spider", "trax"]);
  });

  it("from day 10 a wave can bring one D1000, never two", () => {
    let found = false;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const s = waveReady(seed, 500);
      huntersCycle(s, 10);
      expect(count(s, "dice")).toBeLessThanOrEqual(1);
      found = count(s, "dice") === 1;
    }
    expect(found).toBe(true);
  });

  it("each arrives at its kind's hp and aim; only the asteroid has a countdown", () => {
    const s = ship(["hunter", "spider", "asteroid", "dice", "trax"]);
    const { types } = s.config.hunters;
    expect(s.hunters.list.map((h) => [h.type, h.hp, h.hitChance, h.countdown])).toEqual(HUNTER_TYPES.map((t) => [t, types[t].hp, types[t].hitChance, types[t].countdown]));
  });

  it("with too few points for anything the roll isn't made", () => {
    // Still under the plain hunter's 10 after the cycle's points come in.
    const s = waveReady(1, -100);
    const rng = s.rng;
    huntersCycle(s, 5);
    expect([s.hunters.list, s.rng]).toEqual([[], rng]);
  });
});

describe("the Arack", () => {
  it("stops travel and leaving orbit while it is around, shown disabled with the reason and no AP spent", () => {
    const s = ship(["spider"]);
    expect(refusal(s, "p0", travel)).toBe(ARACK_AROUND);
    expect(option(s, "p0", { type: "travel" })?.lacks).toEqual(["arack"]);
    expect(applyAction(s, "p0", travel).ok).toBe(false);
    s.navigation.orbit = "planet-x";
    expect(refusal(s, "p0", leave)).toBe(ARACK_AROUND);
    expect(option(s, "p0", { type: "leave_orbit" })?.lacks).toEqual(["arack"]);
  });

  it("once it is shot down the ship can jump again", () => {
    const s = ship(["spider", "hunter"]);
    damageHunter(s, s.hunters.list[0]!.id, 100);
    expect(refusal(s, "p0", travel)).toBeNull();
  });
});

describe("the asteroid", () => {
  it("doesn't aim or shoot; it counts down each cycle change, seen with its hp in a turret room", () => {
    const s = ship(["asteroid"]);
    const { hull, plasmaShield } = s.ship;
    huntersCycle(s, 5);
    expect(s.hunters.list[0]).toMatchObject({ target: null, countdown: 5 });
    expect([s.ship.hull, s.ship.plasmaShield - s.config.ship.plasmaShield.regen]).toEqual([hull, plasmaShield]);
    expect(viewFor(s, "p1").hunters.list).toEqual([{ id: s.hunters.list[0]!.id, type: "asteroid", hp: 20, countdown: 5 }]);
    expect(viewFor(s, "p2").hunters).toMatchObject({ count: 1, list: null });
  });

  it("when the countdown runs out it hits the Daedalus for its hp through the shield, is gone, and NERON tells everyone", () => {
    const s = ship(["asteroid"]);
    s.hunters.list[0]!.hp = 12;
    s.hunters.list[0]!.countdown = 1;
    const { hull, plasmaShield } = s.ship;
    huntersCycle(s, 5);
    const toShield = Math.round((12 * s.config.ship.plasmaShield.absorbPercent) / 100);
    expect(s.hunters.list).toEqual([]);
    expect(s.ship.hull).toBe(hull - (12 - toShield));
    expect(s.ship.plasmaShield).toBe(Math.min(s.config.ship.plasmaShield.max, plasmaShield - toShield + s.config.ship.plasmaShield.regen));
    // Its debris is left in space, as in eMush (owner, 2026-11-21, #422).
    expect(s.space.length).toBeGreaterThanOrEqual(1);
    for (const d of s.space) expect(Object.keys(s.config.hunters.types.asteroid.debris.types)).toContain(d.type);
    for (const id of ["p0", "p1", "p2"]) expect(viewFor(s, id).log.filter((e) => e.key === "asteroidImpact")).toHaveLength(1);
  });

  it("an impact that empties the hull destroys the ship", () => {
    const s = ship(["asteroid"]);
    s.hunters.list[0]!.countdown = 1;
    s.ship.hull = 1;
    s.ship.plasmaShield = 0;
    huntersCycle(s, 5);
    expect([s.phase, s.ending]).toEqual(["ended", "ship_destroyed"]);
  });

  it("never follows a jump", () => {
    const next = must(applyAction(ship(["asteroid", "asteroid"]), "p0", travel));
    expect(next.hunters.list).toEqual([]);
  });
});

describe("the D1000", () => {
  it("acts three times a cycle: a hit makes it aim again, so with a sure aim it hits twice", () => {
    const s = ship(["dice"], { hunters: { types: { dice: { hitChance: 1 } } } });
    s.hunters.list[0]!.target = { kind: "ship" };
    s.ship.plasmaShield = 0;
    s.bios.plasma_shield = false;
    const hull = s.ship.hull;
    huntersCycle(s, 10);
    const lost = hull - s.ship.hull;
    expect(lost >= 6 && lost <= 12).toBe(true);
    expect(s.hunters.list[0]!.target).toBeNull();
  });

  it("its armor takes 1 off each hit it receives, down to 0", () => {
    const s = ship(["dice"]);
    const id = s.hunters.list[0]!.id;
    expect(damageHunter(s, id, 4)).toBe(false);
    expect(s.hunters.list[0]!.hp).toBe(30 - 3);
    damageHunter(s, id, 1);
    expect(s.hunters.list[0]!.hp).toBe(27);
  });

  it("never follows a jump", () => {
    expect(must(applyAction(ship(["dice"]), "p0", travel)).hunters.list).toEqual([]);
  });
});

describe("the Trax", () => {
  it("every Trax follows a jump, besides half the plain hunters, and loses its aim", () => {
    const s = ship(["trax", "trax", "hunter", "hunter"]);
    for (const h of s.hunters.list) Object.assign(h, { target: { kind: "ship" }, hitChance: 0.9 });
    const next = must(applyAction(s, "p0", travel));
    expect(count(next, "trax")).toBe(2);
    expect(count(next, "hunter")).toBe(1);
    for (const h of next.hunters.list.filter((h) => h.type === "trax")) expect(h).toMatchObject({ target: null, hitChance: s.config.hunters.types.trax.hitChance });
  });
});
