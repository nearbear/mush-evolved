import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { DEFAULT_CONFIG, PRESELECTION } from "../src/config.ts";
import { huntersPerCyclePoints } from "../src/hunters.ts";
import { followingHuntersShare } from "../src/modifiers.ts";
import { joinShip } from "../src/preselection.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameConfig, GameState } from "../src/types.ts";
import { clone, costOf, makeSeats, must, nextCycle, noHunters, offered, player } from "./support.ts";

const TURRET_ROOM = "LASER_TURRET_A_0";
const TURRET = "LASER_TURRET_A_0:TURRET_COMMAND";
const shoot = (hunter: string, equipment = TURRET): Action => ({ type: "turret_attack", equipment, hunter });
const repair = (item: string): Action => ({ type: "repair_hull", item });
/** Why `id` can't do `action` (null if they can): `applyAction` only says "illegal_action". */
const refusal = (s: GameState, id: string, action: Action) => ACTIONS[action.type]!.check(s, player(s, id), action);
const wire = (action: unknown) => parseGameMessage(JSON.stringify({ type: "action", action }));

/** p0 and p1 at a turret, p2 in the laboratory, with one hunter on the field. `config` tunes the rules (no waves by default). */
function ship(config: Partial<GameConfig> = {}): GameState {
  const s = createGame(makeSeats(3), noHunters({ ...DEFAULT_CONFIG, mushCount: 1, startItems: [], ...config }), 3);
  player(s, "p0").room = player(s, "p1").room = TURRET_ROOM;
  player(s, "p2").room = "LABORATORY";
  s.hunters.list.push({ id: "h1", hp: s.config.hunters.hp, hitChance: s.config.hunters.hitChance, target: null });
  return s;
}

const turrets = (overrides: Partial<GameConfig["turrets"]>) => ({ turrets: { ...DEFAULT_CONFIG.turrets, ...overrides } });
const hullRepair = (overrides: Partial<GameConfig["hullRepair"]>) => ({ hullRepair: { ...DEFAULT_CONFIG.hullRepair, ...overrides } });

describe("hunter numbers", () => {
  it("are the owner's (eMush's waves and hunters, the wiki's turrets and hull repair)", () => {
    const { hunters, turrets, hullRepair } = DEFAULT_CONFIG;
    expect(hunters).toEqual({
      points: { start: 40, perCycle: 6, hardFromDay: 5, hardBonus: 1, veryHardFromDay: 10, veryHardBonus: 2, perHunter: 10 },
      waveChance: 0.2,
      safeCycles: 2,
      hp: 6,
      damage: [2, 4],
      hitChance: 0.8,
      missBonus: 0.1,
      followShare: 0.5,
      patrolTargetChance: 0.15,
      debris: { count: [0, 2, 1], types: { metal_scraps: 2, space_capsule: 1, plastic_scraps: 1 } },
    });
    expect(turrets).toEqual({ cost: { ap: 1 }, chance: 0.3, failureMultiplier: 1.25, damage: [2, 4], charges: 4, rechargePerCycle: 1 });
    expect(hullRepair).toEqual({ cost: { ap: 1 }, chance: 0.25, injuryChance: 0.05, amount: 5 });
    expect(DEFAULT_CONFIG.ship.plasmaShield).toEqual({ start: 50, max: 100, absorbPercent: 33, projectAbsorbPercent: 67, regen: 5 });
  });

  it("the pool gains day + 6 a cycle, +1 from day 5 and +2 instead from day 10", () => {
    const s = ship();
    expect([1, 4, 5, 9, 10].map((day) => huntersPerCyclePoints(s, day))).toEqual([7, 10, 12, 16, 18]);
  });
});

describe("hunter waves", () => {
  it("the pool starts at 40 when the game starts, and never runs in pre-selection", () => {
    const s = createGame(makeSeats(3), DEFAULT_CONFIG, 3);
    expect([s.hunters.points, s.hunters.since]).toEqual([40, s.cycle]);
    let pre = createGame([], { ...DEFAULT_CONFIG, preselection: PRESELECTION }, 1);
    for (const seat of makeSeats(2)) pre = must(joinShip(pre, seat));
    pre = nextCycle(nextCycle(nextCycle(pre)));
    expect(pre.hunters).toEqual({ points: 0, since: null, list: [], nextId: 1 });
    for (const seat of makeSeats(4).slice(2)) pre = must(joinShip(pre, seat));
    expect(pre.preselection).toBe(false);
    expect([pre.hunters.points, pre.hunters.since]).toEqual([40, pre.cycle]);
  });

  it("no wave in the first 2 cycle changes; then the roll spends the pool, one hunter per 10, the rest kept, and NERON tells everyone", () => {
    let s = createGame(makeSeats(3), { ...DEFAULT_CONFIG, hunters: { ...DEFAULT_CONFIG.hunters, waveChance: 1 } }, 3);
    s = nextCycle(nextCycle(s));
    expect(s.hunters.list).toEqual([]);
    const before = s.hunters.points + huntersPerCyclePoints(s, 1);
    s = nextCycle(s);
    const count = Math.floor(before / 10);
    expect(s.hunters.list).toHaveLength(count);
    expect(s.hunters.points).toBe(before % 10);
    expect(s.hunters.list[0]).toEqual({ id: "hunter-1", hp: 6, hitChance: 0.8, target: null });
    expect(s.log.at(-2)).toMatchObject({ key: "hunterWave", params: { count }, visibleTo: "all", level: "warning" });
    expect(s.log.at(-2)!.room).toBeUndefined();
    for (const id of ["p0", "p1", "p2"]) expect(viewFor(s, id).hunters.count).toBe(count);
  });

  it("a failed roll keeps the pool growing", () => {
    let s = createGame(makeSeats(3), noHunters(DEFAULT_CONFIG), 3);
    for (let i = 0; i < 4; i++) s = nextCycle(s);
    expect(s.hunters.list).toEqual([]);
    expect(s.hunters.points).toBe(40 + 4 * huntersPerCyclePoints(s, 1));
  });
});

describe("a hunter's turn", () => {
  it("spends its first action picking the ship, then shoots; a hit does 2-4 through the shield and it picks again", () => {
    let s = ship();
    s.hunters.list[0]!.hitChance = 1;
    s = nextCycle(s);
    expect(s.hunters.list[0]!.target).toEqual({ kind: "ship" });
    expect([s.ship.hull, s.ship.plasmaShield]).toEqual([100, 55]);
    s = nextCycle(s);
    const lost = 100 - s.ship.hull + (60 - s.ship.plasmaShield);
    expect(lost).toBeGreaterThanOrEqual(2);
    expect(lost).toBeLessThanOrEqual(4);
    expect(s.hunters.list[0]).toMatchObject({ target: null, hitChance: 0.8 });
    expect(s.log.some((e) => e.key.startsWith("hunter") && e.key !== "hunterWave")).toBe(false);
  });

  it("each miss adds 10% to its next shot", () => {
    let s = ship();
    s.hunters.list[0]!.target = { kind: "ship" };
    s.hunters.list[0]!.hitChance = 0;
    s = nextCycle(s);
    expect(s.hunters.list[0]).toMatchObject({ target: { kind: "ship" }, hitChance: 0.1 });
    expect(s.ship.hull).toBe(100);
  });

  it("at 0 hull the Daedalus explodes and everyone dies", () => {
    let s = ship();
    s.ship.hull = 1;
    s.ship.plasmaShield = 0;
    Object.assign(s.hunters.list[0]!, { target: { kind: "ship" }, hitChance: 1 });
    s = nextCycle(s);
    expect(s.ship.hull).toBe(0);
    expect(s.players.every((p) => !p.alive)).toBe(true);
    expect([s.phase, s.winner, s.ending]).toEqual(["ended", "mush", "ship_destroyed"]);
    expect(s.log.some((e) => e.key === "shipDestroyed" && e.visibleTo === "all" && e.room === undefined)).toBe(true);
  });
});

describe("the cycle change", () => {
  it("recharges each turret by 1 up to 4, and the shield by 5 up to 100 while the BIOS has it on", () => {
    let s = ship();
    s.turrets[TURRET] = 2;
    s.ship.plasmaShield = 97;
    s = nextCycle(s);
    expect([s.turrets[TURRET], s.ship.plasmaShield]).toEqual([3, 100]);
    s = nextCycle(s);
    expect(s.turrets[TURRET]).toBeUndefined(); // full
    s.bios.plasma_shield = false;
    s.ship.plasmaShield = 40;
    s = nextCycle(s);
    expect(s.ship.plasmaShield).toBe(40);
  });
});

describe("shooting from a turret", () => {
  it("is offered at a turret for each hunter, to anyone alive (Mush and dirty included), for 1 AP at 30%", () => {
    const s = ship();
    s.hunters.list.push({ id: "h2", hp: 6, hitChance: 0.8, target: null });
    player(s, "p1").statuses.push("dirty");
    for (const id of ["p0", "p1"]) expect(offered(s, id).filter((a) => a.type === "turret_attack")).toEqual([shoot("h1"), shoot("h2")]);
    expect(offered(s, "p2").filter((a) => a.type === "turret_attack")).toEqual([]);
    expect(costOf(s, "p0", shoot("h1"))).toEqual({ ap: 1, mp: 0 });
    const o = viewFor(s, "p0").actions.find((a) => a.action.type === "turret_attack")!;
    expect(o.chance).toBeCloseTo(0.3);
  });

  it("a hit costs a charge, does 2-4 damage, resets the miss streak, and only the shooter is told", () => {
    let s = ship(turrets({ chance: 1 }));
    s.turretFailures.p0 = 2;
    s = must(applyAction(s, "p0", shoot("h1")));
    expect(s.turrets[TURRET]).toBe(3);
    expect(s.hunters.list[0]!.hp).toBeGreaterThanOrEqual(2);
    expect(s.hunters.list[0]!.hp).toBeLessThanOrEqual(4);
    expect(s.turretFailures.p0).toBeUndefined();
    expect(s.log.at(-1)).toMatchObject({ key: "turretHit", visibleTo: ["p0"], params: { damage: 6 - s.hunters.list[0]!.hp } });
  });

  it("a miss costs a charge too, and each miss in a row multiplies the next chance by 1.25", () => {
    let s = ship(turrets({ chance: 0 }));
    s = must(applyAction(s, "p0", shoot("h1")));
    expect([s.turrets[TURRET], s.turretFailures.p0, s.hunters.list[0]!.hp]).toEqual([3, 1, 6]);
    expect(s.log.at(-1)).toMatchObject({ key: "turretMiss", visibleTo: ["p0"] });
    const odds = ship();
    odds.turretFailures.p0 = 2;
    expect(viewFor(odds, "p0").actions.find((a) => a.action.type === "turret_attack")!.chance).toBeCloseTo(0.3 * 1.25 ** 2);
  });

  it("a kill removes the hunter and is public in the turret room", () => {
    let s = ship(turrets({ chance: 1 }));
    s.hunters.list[0]!.hp = 1;
    s = must(applyAction(s, "p0", shoot("h1")));
    expect(s.hunters.list).toEqual([]);
    expect(s.log.at(-1)).toMatchObject({ key: "hunterDestroyed", room: TURRET_ROOM, visibleTo: "all", params: { name: player(s, "p0").character } });
    expect(viewFor(s, "p1").log.at(-1)?.key).toBe("hunterDestroyed");
    expect(viewFor(s, "p2").log.some((e) => e.key === "hunterDestroyed")).toBe(false);
  });

  it("is refused with no charges, at another room's turret, at a gone hunter, or in pre-selection; the state stays as it was", () => {
    const s = ship();
    s.turrets[TURRET] = 0;
    const before = clone(s);
    expect(applyAction(s, "p0", shoot("h1"))).toEqual({ ok: false, error: "illegal_action" });
    expect(refusal(s, "p0", shoot("h1"))).toBe("no_charges");
    expect(refusal(s, "p0", shoot("h1", "LASER_TURRET_B_0:TURRET_COMMAND"))).toBe("cant_shoot");
    expect(refusal(s, "p0", shoot("nope"))).toBe("no_such_hunter");
    s.preselection = true;
    expect(refusal(s, "p1", shoot("h1"))).toBe("preselection");
    s.preselection = false;
    expect(s).toEqual(before);
  });

  it("each hunter's hp and the turrets' charges go only to the living in a turret room; the count to everyone", () => {
    const s = ship();
    s.turrets[TURRET] = 2;
    expect(viewFor(s, "p0").hunters).toEqual({
      count: 1,
      list: [{ id: "h1", hp: 6 }],
      turrets: expect.objectContaining({ [TURRET]: 2, "LASER_TURRET_B_2:TURRET_COMMAND": 4 }),
    });
    expect(Object.keys(viewFor(s, "p0").hunters.turrets!)).toHaveLength(6);
    expect(viewFor(s, "p2").hunters).toEqual({ count: 1, list: null, turrets: null });
    player(s, "p1").alive = false;
    expect(viewFor(s, "p1").hunters).toEqual({ count: 1, list: null, turrets: null });
  });

  it("parses from the wire", () => {
    expect(wire(shoot("h1"))).toEqual({ type: "action", action: shoot("h1") });
    expect(wire({ type: "turret_attack", equipment: TURRET })).toBeNull();
  });
});

describe("repairing the hull", () => {
  /** p2 in the laboratory with a scrap on the floor and one in hand, the hull at 90. */
  function damaged(config: Partial<GameConfig> = {}): GameState {
    const s = ship(config);
    s.ship.hull = 90;
    s.items.push({ id: "floor", type: "metal_scraps", at: { kind: "room", id: "LABORATORY" } });
    s.items.push({ id: "hand", type: "metal_scraps", at: { kind: "player", id: "p2" } });
    return s;
  }

  it("is offered for each scrap in reach, anywhere, while the hull isn't full, for 1 AP at 25%", () => {
    const s = damaged();
    expect(offered(s, "p2").filter((a) => a.type === "repair_hull")).toEqual([repair("floor"), repair("hand")]);
    expect(offered(s, "p0").filter((a) => a.type === "repair_hull")).toEqual([]);
    expect(costOf(s, "p2", repair("hand"))).toEqual({ ap: 1, mp: 0 });
    expect(viewFor(s, "p2").actions.find((a) => a.action.type === "repair_hull")!.chance).toBeCloseTo(0.25);
    s.ship.hull = 100;
    expect(offered(s, "p2").filter((a) => a.type === "repair_hull")).toEqual([]);
    expect(refusal(s, "p2", repair("hand"))).toBe("hull_full");
  });

  it("a success adds 5 hull up to 100, uses up the scrap, and is public in the room", () => {
    let s = damaged(hullRepair({ chance: 1 }));
    s = must(applyAction(s, "p2", repair("hand")));
    expect(s.ship.hull).toBe(95);
    expect(s.items.some((i) => i.id === "hand")).toBe(false);
    expect(s.log.at(-1)).toMatchObject({ key: "hullRepaired", room: "LABORATORY", visibleTo: "all" });
    s.ship.hull = 98;
    s = must(applyAction(s, "p2", repair("floor")));
    expect(s.ship.hull).toBe(100);
  });

  it("a failure keeps the scrap and only the repairer is told", () => {
    let s = damaged(hullRepair({ chance: 0 }));
    s = must(applyAction(s, "p2", repair("hand")));
    expect(s.ship.hull).toBe(90);
    expect(s.items.some((i) => i.id === "hand")).toBe(true);
    expect(s.log.at(-1)).toMatchObject({ key: "hullRepairFailed", visibleTo: ["p2"] });
  });

  it("is refused for another room's scrap or a non-scrap", () => {
    const s = damaged();
    s.items.push({ id: "wrench", type: "wrench", at: { kind: "player", id: "p2" } });
    expect(refusal(s, "p0", repair("floor"))).toBe("cant_repair_hull");
    expect(refusal(s, "p2", repair("wrench"))).toBe("cant_repair_hull");
    expect(wire(repair("hand"))).toEqual({ type: "action", action: repair("hand") });
  });
});

describe("hunters following a jump", () => {
  const TERMINAL = "COMMAND_CENTER:PILOT_MODULE";
  const travel: Action = { type: "travel", equipment: TERMINAL };
  const leave: Action = { type: "leave_orbit", equipment: TERMINAL };

  /** p0, the Commander, at the Command terminal with fuel loaded, and `n` hunters with distinct hp, all aiming. */
  function jumpReady(n: number, config: Partial<GameConfig> = {}): GameState {
    const s = ship(config);
    player(s, "p0").room = "COMMAND_CENTER";
    s.titles.commander = "p0";
    s.ship.combustion = 2;
    s.hunters.list = Array.from({ length: n }, (_, i) => ({ id: `h${i + 1}`, hp: i + 1, hitChance: 0.9, target: { kind: "ship" } }));
    return s;
  }

  it("half the hunters, rounded up, follow a travel; they keep their hp and lose their aim", () => {
    for (const n of [1, 2, 3, 5]) {
      const s = jumpReady(n);
      const next = must(applyAction(s, "p0", travel));
      expect(next.hunters.list).toHaveLength(Math.ceil(n * DEFAULT_CONFIG.hunters.followShare));
      for (const h of next.hunters.list) {
        expect(h).toEqual({ id: h.id, hp: s.hunters.list.find((o) => o.id === h.id)!.hp, hitChance: s.config.hunters.hitChance, target: null });
      }
      expect(next.hunters.points).toBe(s.hunters.points);
    }
  });

  it("which ones follow comes from the seed, and the followers keep their order", () => {
    const picks = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = jumpReady(4);
      s.rng = seed;
      const ids = must(applyAction(s, "p0", travel)).hunters.list.map((h) => h.id);
      expect(ids).toEqual([...ids].sort());
      expect(must(applyAction(s, "p0", travel)).hunters.list.map((h) => h.id)).toEqual(ids);
      picks.add(ids.join());
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it("leaving orbit is a jump too", () => {
    const s = jumpReady(4);
    s.navigation.orbit = "planet-x";
    expect(must(applyAction(s, "p0", leave)).hunters.list).toHaveLength(2);
  });

  it("a jump with no hunters around brings none, and one with no fuel loaded leaves them all", () => {
    expect(must(applyAction(jumpReady(0), "p0", travel)).hunters.list).toEqual([]);
    const dry = jumpReady(3);
    dry.ship.combustion = 0;
    expect(must(applyAction(dry, "p0", travel)).hunters.list).toEqual(dry.hunters.list);
    const stuck = jumpReady(3);
    stuck.ship.combustion = 0;
    stuck.navigation.orbit = "planet-x";
    expect(must(applyAction(stuck, "p0", leave)).hunters.list).toEqual(stuck.hunters.list);
  });

  it("the share is tunable, and living holders' crewFollowingHunters hooks fold it (Space Tactics' seam), kept within 0-1", () => {
    expect(must(applyAction(jumpReady(4, { hunters: { ...DEFAULT_CONFIG.hunters, followShare: 0 } }), "p0", travel)).hunters.list).toEqual([]);
    const s = jumpReady(1);
    player(s, "p1").modifiers = ["tactics"];
    const registry = { tactics: { crewFollowingHunters: (share: number) => share * 0.66 } };
    expect(followingHuntersShare(0.5, s, registry)).toBeCloseTo(0.33);
    expect(followingHuntersShare(2, s, {})).toBe(1);
    player(s, "p1").alive = false;
    expect(followingHuntersShare(0.5, s, registry)).toBe(0.5);
  });
});
