import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { TREE_POT_ITEM } from "../src/items.ts";
import { channelLimit, computerPointsCap } from "../src/modifiers.ts";
import { SKILL_SLOTS, skillStatus } from "../src/skills.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState } from "../src/types.ts";
import { makeSeats, must, nextCycle, nextDay, noHunters, option, player, pickSkill } from "./support.ts";

const TURRET_ROOM = "LASER_TURRET_A_0";
const TURRET = "LASER_TURRET_A_0:TURRET_COMMAND";
const shoot: Action = { type: "turret_attack", equipment: TURRET, hunter: "h1" };

function ship(config: Partial<GameConfig> = {}): GameState {
  const s = createGame(makeSeats(3), noHunters({ ...DEFAULT_CONFIG, mushCount: 1, startItems: [], ...config }), 3);
  player(s, "p0").room = TURRET_ROOM;
  s.hunters.list.push({ id: "h1", hp: 100, hitChance: s.config.hunters.hitChance, target: null });
  return s;
}

const give = (s: GameState, id: string, skill: string) => player(s, id).skills.push(skill);
const shotChance = (s: GameState) => option(s, "p0", { type: "turret_attack" })!.chance;

describe("combat skills' numbers", () => {
  it("are the owner's (the original skills.json, 2026-10-24 and 2026-10-25)", () => {
    const { gunman, gunner, persistent, spaceTactics, polymath } = DEFAULT_CONFIG;
    expect([gunman.capPoints, gunman.pointsPerDay]).toEqual([4, 2]);
    expect([gunner.accuracyFactor, gunner.damageFactor]).toEqual([2, 2]);
    expect(persistent.failureMultiplier).toBe(1.5);
    expect([spaceTactics.chance, spaceTactics.shrink]).toEqual([0.5, 0.33]);
    expect([polymath.channels, polymath.computerPointsPerDay, polymath.computerCapBonus]).toEqual([2, 1, 2]);
  });
});

describe("Gunner", () => {
  it("doubles the chance to hit from a turret and the damage of a hit", () => {
    const s = ship();
    const base = shotChance(s);
    give(s, "p0", "gunner");
    expect(shotChance(s)).toBeCloseTo(base * 2);
    const hit = ship({ turrets: { ...DEFAULT_CONFIG.turrets, chance: 1 } });
    give(hit, "p0", "gunner");
    const [lo, hi] = DEFAULT_CONFIG.turrets.damage;
    const damage = 100 - must(applyAction(hit, "p0", shoot)).hunters.list[0]!.hp;
    expect(damage % 2).toBe(0);
    expect(damage).toBeGreaterThanOrEqual(lo * 2);
    expect(damage).toBeLessThanOrEqual(hi * 2);
  });

  it("changes nothing for someone else at the same turret", () => {
    const s = ship();
    const base = shotChance(s);
    give(s, "p1", "gunner");
    expect(shotChance(s)).toBe(base);
  });
});

describe("Gunman", () => {
  it("gets 2 Shoot points when picked and each day, up to 4", () => {
    let s = ship();
    s = pickSkill(s, "p0", "gunman");
    expect(player(s, "p0").resources.shoot).toBe(2);
    s = nextDay(s);
    expect(player(s, "p0").resources.shoot).toBe(4);
    s = nextDay(s);
    expect(player(s, "p0").resources.shoot).toBe(4);
    expect(player(s, "p1").resources.shoot).toBe(0);
  });

  it("makes a shot free and spends a point, on a hit and on a miss, and costs 1 AP without one", () => {
    for (const chance of [1, 0]) {
      const s = ship({ turrets: { ...DEFAULT_CONFIG.turrets, chance } });
      give(s, "p0", "gunman");
      player(s, "p0").resources.shoot = 1;
      const ap = player(s, "p0").ap;
      expect(option(s, "p0", { type: "turret_attack" })!.cost.ap).toBe(0);
      const after = must(applyAction(s, "p0", shoot));
      expect([player(after, "p0").ap, player(after, "p0").resources.shoot, after.turrets[TURRET]]).toEqual([ap, 0, DEFAULT_CONFIG.turrets.charges - 1]);
      expect(option(after, "p0", { type: "turret_attack" })!.cost.ap).toBe(DEFAULT_CONFIG.turrets.cost.ap);
      const paid = must(applyAction(after, "p0", shoot));
      expect(player(paid, "p0").ap).toBe(ap - DEFAULT_CONFIG.turrets.cost.ap);
    }
  });

  it("shows the Shoot counter to its holder", () => {
    const s = ship();
    give(s, "p0", "gunman");
    expect(viewFor(s, "p0").you.resources.shoot).toBe(0);
  });
});

describe("Persistent", () => {
  it("grows the odds 1.5x a miss at turrets instead of 1.25x, and only for its holder", () => {
    const s = ship();
    s.turretFailures.p0 = 2;
    expect(shotChance(s)).toBeCloseTo(0.3 * 1.25 ** 2);
    give(s, "p0", "persistent");
    expect(shotChance(s)).toBeCloseTo(0.3 * 1.5 ** 2);
    s.turretFailures.p0 = 0;
    expect(shotChance(s)).toBeCloseTo(0.3);
  });

  it("does the same for the astro scan", () => {
    const s = createGame(makeSeats(3), structuredClone(DEFAULT_CONFIG), 7);
    for (const p of s.players) p.room = "COMMAND_CENTER";
    const scan = { type: "scan_planet", equipment: "COMMAND_CENTER:ASTRO_MODULE" } as const;
    const { chance, failureMultiplier } = s.config.astro.scan;
    s.scanFailures.p0 = s.scanFailures.p1 = 1;
    give(s, "p0", "persistent");
    expect(option(s, "p0", scan)!.chance).toBeCloseTo(chance * 1.5);
    expect(option(s, "p1", scan)!.chance).toBeCloseTo(chance * failureMultiplier);
  });
});

describe("Space Tactics", () => {
  const waves = (holder: boolean, chance: number, alive = true): GameState => {
    let s = createGame(makeSeats(3), { ...DEFAULT_CONFIG, hunters: { ...DEFAULT_CONFIG.hunters, waveChance: 1 }, spaceTactics: { chance, shrink: 0.33 } }, 3);
    if (holder) give(s, "p2", "space_tactics");
    if (!alive) player(s, "p2").alive = false;
    s = nextCycle(nextCycle(s));
    return nextCycle(s);
  };

  it("makes a wave a third smaller when it rolls, spending the points in full and announcing the smaller count", () => {
    const plain = waves(false, 1);
    const full = plain.hunters.list.length;
    const s = waves(true, 1);
    expect(s.hunters.list).toHaveLength(full - Math.floor(full * 0.33));
    expect(s.hunters.points).toBe(plain.hunters.points);
    expect(s.log.at(-2)).toMatchObject({ key: "hunterWave", params: { count: s.hunters.list.length } });
    expect(full).toBeGreaterThanOrEqual(4);
  });

  it("does nothing when the roll fails, with no holder, or once the holder is dead", () => {
    const full = waves(false, 1).hunters.list.length;
    expect(waves(true, 0).hunters.list).toHaveLength(full);
    expect(waves(false, 1).hunters.list).toHaveLength(full);
    expect(waves(true, 1, false).hunters.list).toHaveLength(full);
  });
});

describe("Polymath", () => {
  it("allows 2 more private channels", () => {
    const s = ship();
    expect(channelLimit(s, player(s, "p0"))).toBe(3);
    give(s, "p0", "polymath");
    expect(channelLimit(s, player(s, "p0"))).toBe(5);
    expect(channelLimit(s, player(s, "p1"))).toBe(3);
  });

  it("gives 1 Computer point when picked and a day, holding up to 6, and a Computer Scientist keeps the cap of 4", () => {
    let s = ship();
    s = pickSkill(s, "p0", "polymath");
    expect(player(s, "p0").resources.comp).toBe(1);
    expect(computerPointsCap(s, player(s, "p0"))).toBe(6);
    player(s, "p0").resources.comp = 5;
    s = nextDay(s);
    expect(player(s, "p0").resources.comp).toBe(6);
    s = nextDay(s);
    expect(player(s, "p0").resources.comp).toBe(6);
    give(s, "p1", "computer");
    expect(computerPointsCap(s, player(s, "p1"))).toBe(4);
    expect(SKILL_SLOTS).toBe(3);
  });
});

describe("Paranoid", () => {
  const cameras = (s: GameState, id: string) => s.items.filter((i) => i.type === "camera" && i.at.kind === "player" && i.at.id === id).length;

  it("gives one extra camera when picked (owner, 2026-10-27)", () => {
    expect(DEFAULT_CONFIG.paranoid.cameras).toBe(1);
    let s = ship();
    s = pickSkill(s, "p0", "paranoid");
    expect([cameras(s, "p0"), cameras(s, "p1")]).toEqual([DEFAULT_CONFIG.paranoid.cameras, 0]);
    expect(skillStatus("paranoid")).toBe("full");
  });
});

describe("Green Thumb", () => {
  const pots = (s: GameState, id: string) => s.items.filter((i) => i.type === TREE_POT_ITEM && i.at.kind === "player" && i.at.id === id);

  it("gives two empty hydropots when picked (owner, 2026-11-01)", () => {
    expect(DEFAULT_CONFIG.greenThumb.pots).toBe(2);
    let s = ship();
    s = pickSkill(s, "p0", "green_thumb");
    expect(pots(s, "p0")).toHaveLength(DEFAULT_CONFIG.greenThumb.pots);
    expect(pots(s, "p0").every((i) => i.plant === undefined)).toBe(true);
    expect(pots(s, "p1")).toHaveLength(0);
    expect(skillStatus("green_thumb")).toBe("partial");
  });
});

describe("Astrophysicist", () => {
  const terminal = "COMMAND_CENTER:ASTRO_MODULE";
  const scan = { type: "scan_planet", equipment: terminal } as const;
  const setup = () => {
    const s = createGame(makeSeats(3), structuredClone(DEFAULT_CONFIG), 7);
    for (const p of s.players) p.room = "COMMAND_CENTER";
    return s;
  };

  it("takes 1 AP off the scan and gives one more sector per analysis (owner, 2026-10-27)", () => {
    expect(DEFAULT_CONFIG.astrophysicist).toEqual({ scanApDiscount: 1, extraSectors: 1 });
    expect(skillStatus("astrophysician")).toBe("full");
    const s = setup();
    player(s, "p0").skills.push("astrophysician");
    const { scan: sc, analyze } = s.config.astro;
    expect([option(s, "p0", scan)!.cost.ap, option(s, "p1", scan)!.cost.ap]).toEqual([sc.cost.ap - 1, sc.cost.ap]);
    s.planets.p0 = [{ id: "pl", name: "X", position: { direction: "N", distance: 2 }, sectors: ["FOREST", "MOUNTAIN", "SWAMP", "DESERT"].map((tag) => ({ tag, known: false })) } as never];
    s.planets.p1 = structuredClone(s.planets.p0);
    const known = (id: string) => s.planets[id]![0]!.sectors.filter((x) => x.known).length;
    const a = must(applyAction(s, "p0", { type: "analyze_planet", equipment: terminal, planet: "pl" }));
    const b = must(applyAction(a, "p1", { type: "analyze_planet", equipment: terminal, planet: "pl" }));
    expect([a.planets.p0![0]!.sectors.filter((x) => x.known).length, b.planets.p1![0]!.sectors.filter((x) => x.known).length]).toEqual([2, 1]);
    expect(known("p0")).toBe(0);
    expect(analyze.cost.ap).toBeGreaterThan(0);
  });

  it("stacks with deep analysis: 3 sectors on the orbited planet, at the orbit cost", () => {
    const s = setup();
    player(s, "p0").skills.push("astrophysician");
    const mk = () => ({ id: "near", name: "X", position: { direction: "N", distance: 2 }, sectors: ["FOREST", "MOUNTAIN", "SWAMP", "DESERT", "OCEAN"].map((tag) => ({ tag, known: false })) }) as never;
    s.planets.p0 = [mk()];
    s.planets.p1 = [mk()];
    s.navigation.orbit = "near";
    const deep = { type: "analyze_planet", equipment: terminal, planet: "near" } as const;
    const { orbitCost, orbitExtraSectors } = s.config.astro.analyze;
    expect(option(s, "p0", deep)!.cost.ap).toBe(orbitCost.ap);
    const after = must(applyAction(s, "p0", deep));
    const known = (id: string) => after.planets[id]![0]!.sectors.filter((x) => x.known).length;
    expect([known("p0"), known("p1")]).toEqual([1 + s.config.astrophysicist.extraSectors + orbitExtraSectors, 0]);
  });
});
