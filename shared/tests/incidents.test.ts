import { describe, expect, it } from "vitest";
import { isBreakable } from "../src/breakage.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { allDoors, doorRooms } from "../src/doors.ts";
import { EQUIPMENT_TYPES } from "../src/equipment.ts";
import { INCIDENT_IDS, incidentPointsForDay, type IncidentId } from "../src/incidents.ts";
import { hasCamera } from "../src/log.ts";
import { MODIFIERS } from "../src/modifiers.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { turretCharges } from "../src/hunters.ts";
import type { GameConfig, GameState } from "../src/types.ts";
import { clone, makeSeats, mustApply, nextCycle, nextDay, noHunters, noIncidents, offered, option, pickSkill, player } from "./support.ts";

const HERE = "REFECTORY";
const ELSEWHERE = "LABORATORY";
const COFFEE = "REFECTORY:COFFEE_DISPENSER";

/** A quiet ship (no hunters, no incidents) of 3: p0 and p1 in the refectory, p2 in the laboratory. */
function ship(config: GameConfig = noIncidents(noHunters(DEFAULT_CONFIG)), seed = 3): GameState {
  const s = createGame(makeSeats(3), { ...config, mushCount: 1, startItems: [], startSkills: [] }, seed);
  for (const p of s.players) p.room = p.id === "p2" ? ELSEWHERE : HERE;
  return s;
}

/** Only `id` is on the menu, and incidents always happen once the pool has points. */
const only = (id: IncidentId, config: GameConfig = noHunters(DEFAULT_CONFIG)): GameConfig => ({
  ...config,
  incidents: {
    ...config.incidents,
    rollPoints: 1,
    catalog: Object.fromEntries(INCIDENT_IDS.map((i) => [i, { ...config.incidents.catalog[i], weight: i === id ? 1 : 0 }])) as GameConfig["incidents"]["catalog"],
  },
});

const equipment = (s: GameState, id: string) => Object.values(s.equipment).flat().find((e) => e.id === id)!;
const globalSystem = (s: GameState) => s.chat.filter((m) => m.channel === "global" && m.system).map((m) => m.system!);

describe("incident points: the budget", () => {
  it("follows the wiki's curve: 1, 2, then 1, with more from day 5 and day 10, never falling after day 3", () => {
    const days = Array.from({ length: 12 }, (_, i) => incidentPointsForDay(DEFAULT_CONFIG, i + 1));
    expect(days).toEqual([1, 2, 1, 1, 2, 3, 4, 5, 6, 15, 18, 21]);
    for (let d = 3; d < 40; d++) expect(incidentPointsForDay(DEFAULT_CONFIG, d + 1)).toBeGreaterThanOrEqual(incidentPointsForDay(DEFAULT_CONFIG, d));
  });

  it("fills the pool at each cycle change, pre-selection included, and carries it over while nothing happens", () => {
    let s = ship();
    expect(s.incidentPoints).toBe(0);
    s = nextCycle(s);
    expect(s.incidentPoints).toBe(incidentPointsForDay(s.config, 1));
    s = nextCycle(s);
    expect(s.incidentPoints).toBe(2 * incidentPointsForDay(s.config, 1));
  });
});

describe("incident points: spending", () => {
  it("buys incidents until none it can afford has a target, never beyond the pool, and keeps the rest", () => {
    const s = ship(only("tremor"));
    s.incidentPoints = 4; // + 1 at the cycle change: two tremors (2 each), 1 left over
    const after = nextCycle(s);
    expect(after.incidentPoints).toBe(1);
    expect(after.log.filter((e) => e.key === "tremor")).toHaveLength(2);
  });

  it("Bric-a-brac: when the prevention roll succeeds the points are spent but no incident happens", () => {
    const config = only("tremor");
    const s = ship({ ...config, project: { ...config.project, bricBroc: { preventChance: 1 } } });
    s.projects.BRIC_BROC = 100;
    s.incidentPoints = 4;
    const after = nextCycle(s);
    expect(after.incidentPoints).toBe(1);
    expect(after.log.filter((e) => e.key === "tremor")).toHaveLength(0);
    expect(globalSystem(after).filter((m) => m.key === "bricBrocPrevented")).toHaveLength(1);
  });

  it("Bric-a-brac: does nothing until the project is complete", () => {
    const config = only("tremor");
    const s = ship({ ...config, project: { ...config.project, bricBroc: { preventChance: 1 } } });
    s.projects.BRIC_BROC = 99;
    s.incidentPoints = 4;
    expect(nextCycle(s).log.filter((e) => e.key === "tremor")).toHaveLength(2);
  });

  it("spends nothing when the roll fails (chance pool ÷ rollPoints)", () => {
    const config = only("tremor");
    const s = ship({ ...config, incidents: { ...config.incidents, rollPoints: Number.MAX_SAFE_INTEGER } });
    s.incidentPoints = 10;
    expect(nextCycle(s).incidentPoints).toBe(11);
  });

  it("reproduces the same incidents from the same seed", () => {
    const run = (seed: number) => {
      let s = ship(noHunters(DEFAULT_CONFIG), seed);
      s.incidentPoints = 40;
      for (let i = 0; i < 6; i++) s = nextCycle(s);
      return { log: s.log.map((e) => e.key), chat: globalSystem(s), points: s.incidentPoints, fires: s.fires };
    };
    expect(run(17)).toEqual(run(17));
  });

  it("spends more as the days pass, in a headless run", () => {
    let s = ship(noHunters(DEFAULT_CONFIG), 5);
    s.players[0]!.cheats.push("invincible"); // nobody dies and the hull holds, so the run lasts
    const spentByDay: number[] = [];
    for (let day = 1; day <= 12; day++) {
      let spent = 0;
      for (let c = 0; c < s.config.cyclesPerDay; c++) {
        const nextDay = Math.floor(s.cycle / s.config.cyclesPerDay) + 1; // the day of the cycle about to begin
        const before = s.incidentPoints + incidentPointsForDay(s.config, nextDay);
        s = nextCycle(s);
        spent += before - s.incidentPoints;
      }
      spentByDay.push(spent);
    }
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    expect(sum(spentByDay.slice(8))).toBeGreaterThan(sum(spentByDay.slice(0, 4)));
  });
});

describe("incidents", () => {
  it("tremor: one room with crew, each person there loses their own 1 to 3 HP, in that room's log", () => {
    const s = ship(only("tremor"));
    s.players[2]!.room = HERE;
    s.incidentPoints = 1;
    const after = nextCycle(s);
    for (const p of after.players) expect(s.players.find((o) => o.id === p.id)!.hp - p.hp).toBeGreaterThanOrEqual(1);
    for (const p of after.players) expect(s.players.find((o) => o.id === p.id)!.hp - p.hp).toBeLessThanOrEqual(3);
    expect(after.log.find((e) => e.key === "tremor")).toMatchObject({ room: HERE, visibleTo: "all" });
  });

  it("panic attack: 3 morale, at most once per person a cycle, Mush included, told privately", () => {
    const s = ship(only("panic_attack"));
    s.incidentPoints = 20; // enough for more than 3
    const after = nextCycle(s);
    for (const p of after.players) expect(p.morale).toBe(player(s, p.id).morale - after.config.incidents.panicAttack.morale);
    expect(after.incidentPoints).toBe(21 - 3 * 2);
    const line = after.log.find((e) => e.key === "panicAttack")!;
    expect(line.visibleTo).toHaveLength(1);
  });

  it("metal plate: 4 to 6 HP to one person aboard, once per person a cycle, in their room's log", () => {
    const s = ship(only("metal_plate"));
    s.incidentPoints = 1;
    const after = nextCycle(s);
    const hit = after.players.filter((p) => p.hp < player(s, p.id).hp);
    expect(hit).toHaveLength(1);
    expect(player(s, hit[0]!.id).hp - hit[0]!.hp).toBeGreaterThanOrEqual(4);
    expect(after.log.find((e) => e.key === "metalPlate")).toMatchObject({ params: { name: hit[0]!.character }, room: hit[0]!.room, visibleTo: "all" });
  });

  it("disease: costs 3 with weight 3", () => {
    expect(DEFAULT_CONFIG.incidents.catalog.disease).toEqual({ cost: 3, weight: 3 });
  });

  // The list itself is the owner's to edit in config.ts; this only checks that whatever it holds can be caught.
  it("disease: the config's incident list is a non-empty set of known diseases, each with its rules", () => {
    const list = DEFAULT_CONFIG.diseases.incidentDiseases;
    expect(list.length).toBeGreaterThan(0);
    expect(new Set(list).size).toBe(list.length);
    for (const id of list) {
      expect(DEFAULT_CONFIG.diseases.allDiseases).toContain(id);
      expect(MODIFIERS[id], id).toBeDefined();
      expect(DEFAULT_CONFIG.diseases.allDiseaseStats.some((stats) => stats.label === id), id).toBe(true);
    }
  });

  it("disease: one incident disease to each person aboard at most once a cycle, Mush included, told privately", () => {
    const s = ship(only("disease"));
    s.incidentPoints = 20; // enough for more than 3
    const after = nextCycle(s);
    const cost = after.config.incidents.catalog.disease.cost;
    expect(after.incidentPoints).toBe(21 - 3 * cost);
    for (const p of after.players) {
      const caught = p.modifiers.filter((m) => !player(s, p.id).modifiers.includes(m));
      expect(caught).toHaveLength(1);
      expect(after.config.diseases.incidentDiseases).toContain(caught[0]);
      expect(p.statuses).toContain(caught[0]);
    }
    const lines = after.log.filter((e) => e.key === "incidentDisease");
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line.visibleTo).toHaveLength(1);
  });

  it("disease: never someone who already has every incident disease, and nothing when nobody can catch one", () => {
    const s = ship(only("disease"));
    for (const p of s.players) for (const d of s.config.diseases.incidentDiseases) p.modifiers.push(d);
    s.incidentPoints = 20;
    const after = nextCycle(s);
    expect(after.incidentPoints).toBe(21);
    expect(after.log.some((e) => e.key === "incidentDisease")).toBe(false);
  });

  it("oxygen leak and fuel leak break a tank, announced in global chat by equipment, never by room", () => {
    for (const [id, type] of [["oxygen_leak", "OXYGEN_TANK"], ["fuel_leak", "FUEL_TANK"]] as const) {
      const s = ship(only(id));
      s.incidentPoints = 2;
      const after = nextCycle(s);
      expect(Object.values(after.equipment).flat().filter((e) => e.broken).map((e) => e.type)).toEqual([type]);
      expect(globalSystem(after)).toContainEqual({ key: "equipmentBroken", params: { equipment: type } });
    }
  });

  it("equipment breakdown breaks one breakable piece of equipment, never one without a repair chance", () => {
    const s = ship(only("equipment_breakdown"));
    s.incidentPoints = 2;
    const broken = Object.values(nextCycle(s).equipment).flat().filter((e) => e.broken);
    expect(broken).toHaveLength(1);
    expect(DEFAULT_CONFIG.repair.chance[broken[0]!.type]).toBeDefined();
  });

  it("shielding is the chance out of 100 that a breakdown's pick holds (Reinforce, owner 2026-11-07)", () => {
    const lone = (shield: number, seed: number): GameState => {
      const s = ship(only("equipment_breakdown"), seed);
      for (const e of Object.values(s.equipment).flat()) if (e.id !== COFFEE) e.broken = true;
      s.equipment[HERE]!.find((e) => e.id === COFFEE)!.shield = shield;
      s.items = [];
      s.incidentPoints = 2;
      return nextCycle(s);
    };
    const broke = (s: GameState) => !!Object.values(s.equipment).flat().find((e) => e.id === COFFEE)!.broken;
    for (let seed = 1; seed <= 10; seed++) {
      expect(broke(lone(100, seed))).toBe(false);
      expect(broke(lone(0, seed))).toBe(true);
    }
    const outcomes = new Set(Array.from({ length: 30 }, (_, i) => broke(lone(50, i + 1))));
    expect(outcomes).toEqual(new Set([true, false]));
  });

  it("a breakdown never picks equipment or an item with green jelly, and picks another instead", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = ship(only("equipment_breakdown"), seed);
      for (const e of Object.values(s.equipment).flat()) e.broken = true;
      const coffee = s.equipment[HERE]!.find((e) => e.id === COFFEE)!;
      const kitchen = s.equipment[HERE]!.find((e) => e.type === "KITCHEN")!;
      delete coffee.broken;
      delete kitchen.broken;
      coffee.jelly = 3;
      s.items = [{ id: "alarm", type: "myco_alarm", at: { kind: "room", id: HERE }, jelly: 2 }];
      s.incidentPoints = 2;
      const after = nextCycle(s);
      expect(after.equipment[HERE]!.find((e) => e.id === COFFEE)!.broken).toBeUndefined();
      expect(after.equipment[HERE]!.find((e) => e.type === "KITCHEN")!.broken).toBe(true);
      expect(after.items.find((i) => i.id === "alarm")!.broken).toBeUndefined();
    }
  });

  it("a breakdown with only jellied targets left does nothing", () => {
    const s = ship(only("equipment_breakdown"));
    for (const e of Object.values(s.equipment).flat()) e.broken = true;
    const coffee = s.equipment[HERE]!.find((e) => e.id === COFFEE)!;
    delete coffee.broken;
    coffee.jelly = 3;
    s.items = [];
    s.incidentPoints = 2;
    expect(nextCycle(s).equipment[HERE]!.find((e) => e.id === COFFEE)!.broken).toBeUndefined();
  });

  it("shielding also protects an item picked by a breakdown", () => {
    const s = ship(only("equipment_breakdown"));
    for (const e of Object.values(s.equipment).flat()) e.broken = true;
    s.items.push({ id: "alarm", type: "myco_alarm", at: { kind: "room", id: HERE }, shield: 100 });
    s.incidentPoints = 2;
    expect(nextCycle(s).items.find((i) => i.id === "alarm")?.broken).toBeUndefined();
  });

  it("equipment breakdown can pick an item whose type breaks on cycle change, announcing only its name", () => {
    const s = ship(only("equipment_breakdown"));
    for (const list of Object.values(s.equipment)) for (const e of list) e.broken = true;
    s.items.push({ id: "alarm", type: "myco_alarm", at: { kind: "room", id: HERE } }, { id: "knife", type: "knife", at: { kind: "room", id: HERE } });
    s.incidentPoints = 2;
    const after = nextCycle(s);
    expect(after.items.find((i) => i.id === "alarm")?.broken).toBe(true);
    expect(after.items.find((i) => i.id === "knife")?.broken).toBeUndefined();
    expect(globalSystem(after)).toContainEqual({ key: "itemBroken", params: { item: "myco_alarm" } });
  });

  it("electrical overload breaks every breakable piece of equipment in a room and costs those present 3 HP", () => {
    const config = only("electrical_overload");
    const s = ship(config);
    // Only the refectory has anything left to break.
    for (const [room, list] of Object.entries(s.equipment)) if (room !== HERE) for (const e of list) e.broken = true;
    s.incidentPoints = 7;
    const after = nextCycle(s);
    expect(after.equipment[HERE]!.filter((e) => config.repair.chance[e.type] !== undefined).every((e) => e.broken)).toBe(true);
    expect(player(after, "p0").hp).toBe(player(s, "p0").hp - config.incidents.electricalOverload.damage);
    expect(player(after, "p2").hp).toBe(player(s, "p2").hp);
    expect(after.log.find((e) => e.key === "electricalOverload")).toMatchObject({ room: HERE, visibleTo: "all" });
  });

  it("fire: a room catches fire, announced in global chat without the room", () => {
    const config = only("fire");
    const s = ship({ ...config, fire: { ...config.fire, spreadChance: 0, breakChance: 0, hullChance: 0 } });
    s.incidentPoints = 3;
    const after = nextCycle(s);
    expect(after.fires).toHaveLength(1);
    expect(globalSystem(after)).toContainEqual({ key: "fireStarted" });
  });

  it("stuck door: costs 3 with weight 10, breaks one working door silently, and skips when none is left", () => {
    expect(DEFAULT_CONFIG.incidents.catalog.stuck_door).toEqual({ cost: 3, weight: 10 });
    const config = only("stuck_door");
    const s = ship(config);
    s.incidentPoints = config.incidents.catalog.stuck_door.cost - 1;
    const after = nextCycle(s);
    const broken = Object.keys(after.doors);
    expect(broken).toHaveLength(1);
    expect(after.incidentPoints).toBe(0);
    expect(after.log.slice(s.log.length)).toEqual([]);
    expect(globalSystem(after)).toEqual([]);

    const [a, b] = doorRooms(broken[0]!);
    const outsider = after.players.find((p) => p.room !== a && p.room !== b)!;
    expect(viewFor(after, outsider.id).doors.some((d) => d.broken)).toBe(false);
    expect(viewFor(after, outsider.id).brokenDoors).toEqual([]);
    expect(viewFor(after, outsider.id).alerts).toEqual({ fires: 0, broken: 1, reports: [] });

    const allBroken = ship(config);
    for (const id of allDoors(allBroken.config.rooms)) allBroken.doors[id] = { broken: true };
    allBroken.incidentPoints = config.incidents.catalog.stuck_door.cost;
    const unchanged = nextCycle(allBroken);
    expect(unchanged.incidentPoints).toBe(config.incidents.catalog.stuck_door.cost + incidentPointsForDay(config, 1));
  });
});

describe("broken equipment", () => {
  const broke = (s: GameState, id: string): GameState => {
    equipment(s, id).broken = true;
    return s;
  };

  it("does nothing: its actions go, Repair comes, and only those in its room see it broken", () => {
    const s = ship();
    expect(offered(s, "p0")).toContainEqual({ type: "dispense", equipment: COFFEE });
    broke(s, COFFEE);
    expect(offered(s, "p0")).not.toContainEqual({ type: "dispense", equipment: COFFEE });
    expect(offered(s, "p0")).toContainEqual({ type: "repair", equipment: COFFEE });
    expect(viewFor(s, "p0").roomEquipment.find((e) => e.id === COFFEE)).toMatchObject({ broken: true });
    expect(JSON.stringify(viewFor(s, "p2"))).not.toContain(COFFEE);
    expect(applyAction(s, "p0", { type: "dispense", equipment: COFFEE })).toEqual({ ok: false, error: "illegal_action" });
  });

  it("an Engineer point pays for a repair", () => {
    const s = broke(ship(), COFFEE);
    player(s, "p0").resources.eng = 1;
    expect(option(s, "p0", { type: "repair" })).toMatchObject({ cost: { ap: 0, mp: 0, paidBy: "eng" } });
    const ap = player(s, "p0").ap;
    const after = mustApply(s, "p0", { type: "repair", equipment: COFFEE });
    expect([player(after, "p0").ap, player(after, "p0").resources.eng]).toEqual([ap, 0]);
  });

  it("the Engineer skill grants 2 Engineer points when picked, 1 a day, up to 2", () => {
    const s = pickSkill(ship(), "p0", "engineer");
    expect(player(s, "p0").resources.eng).toBe(2);
    expect(player(nextDay(s), "p0").resources.eng).toBe(2);
    const spent = clone(s);
    player(spent, "p0").resources.eng = 0;
    expect(player(nextDay(spent), "p0").resources.eng).toBe(1);
  });

  it("repair: the type's base chance, x1.5 with a wrench, x2 for a Technician; a success is public, a failure private", () => {
    const s = broke(ship(), COFFEE);
    const base = s.config.repair.chance.COFFEE_DISPENSER!;
    expect(option(s, "p0", { type: "repair" })).toMatchObject({ cost: { ap: s.config.repair.cost.ap }, chance: base });
    s.items.push({ id: "w", type: "wrench", at: { kind: "player", id: "p0" } });
    expect(option(s, "p0", { type: "repair" })!.chance).toBeCloseTo(base * s.config.repair.wrenchFactor);
    const tech = pickSkill(s, "p1", "engineer");
    expect(option(tech, "p1", { type: "repair" })!.chance).toBeCloseTo(base * s.config.repair.engineerFactor);

    const sure = ship({ ...noIncidents(noHunters(DEFAULT_CONFIG)), repair: { ...DEFAULT_CONFIG.repair, chance: { ...DEFAULT_CONFIG.repair.chance, COFFEE_DISPENSER: 1 } } });
    const fixed = mustApply(broke(sure, COFFEE), "p0", { type: "repair", equipment: COFFEE });
    expect(equipment(fixed, COFFEE).broken).toBeUndefined();
    expect(fixed.log.at(-1)).toMatchObject({ key: "repaired", room: HERE, visibleTo: "all" });

    const never = ship({ ...noIncidents(noHunters(DEFAULT_CONFIG)), repair: { ...DEFAULT_CONFIG.repair, chance: { ...DEFAULT_CONFIG.repair.chance, COFFEE_DISPENSER: 0.0001 } } });
    const failed = mustApply(broke(never, COFFEE), "p0", { type: "repair", equipment: COFFEE });
    expect(equipment(failed, COFFEE).broken).toBe(true);
    expect(failed.log.find((e) => e.key === "repairFailed")).toMatchObject({ visibleTo: ["p0"] });
  });

  it("isn't offered for working equipment, and refusing it leaves state unchanged", () => {
    const s = ship();
    expect(offered(s, "p0").filter((a) => a.type === "repair")).toEqual([]);
    expect(applyAction(s, "p0", { type: "repair", equipment: COFFEE })).toEqual({ ok: false, error: "illegal_action" });
  });

  it("a broken oxygen tank leaks 1 oxygen a cycle", () => {
    const s = ship();
    const before = nextCycle(s).ship.oxygen;
    const leaking = nextCycle(broke(ship(), "STORAGE_A_0:OXYGEN_TANK")).ship.oxygen;
    expect(before - leaking).toBe(s.config.repair.oxygenLeak);
  });

  it("a broken camera records nothing; a broken turret shows 0 charges and gets its own back when repaired", () => {
    const s = ship();
    s.equipment[HERE]!.push({ id: `${HERE}:CAMERA`, type: "CAMERA" });
    expect(hasCamera(s, HERE)).toBe(true);
    expect(hasCamera(broke(s, `${HERE}:CAMERA`), HERE)).toBe(false);

    const turret = "LASER_TURRET_A_0:TURRET_COMMAND";
    s.turrets[turret] = 2;
    broke(s, turret);
    expect(turretCharges(s, turret)).toBe(0);
    delete equipment(s, turret).broken;
    expect(turretCharges(s, turret)).toBe(2);
  });

  it("a broken Com center cuts the link to Sol", () => {
    const config = only("equipment_breakdown");
    const s = ship(config);
    for (const e of Object.values(s.equipment).flat()) if (e.type !== "COM_CENTER") e.broken = true;
    s.comms.linked = true;
    s.incidentPoints = 2;
    const after = nextCycle(s);
    expect(equipment(after, "COMMAND_CENTER:COM_CENTER").broken).toBe(true);
    expect(after.comms.linked).toBe(false);
  });

  it("Hydroponics center (PLANT_CONTROLLER) can break and be sabotaged, with the Command terminal's base repair chance", () => {
    const s = ship();
    expect(isBreakable(s, "PLANT_CONTROLLER")).toBe(true);
    expect(s.config.repair.chance.PLANT_CONTROLLER).toBe(s.config.repair.chance.PILOT_MODULE);
    expect(s.config.repair.chance.PLANT_CONTROLLER).toBe(0.12);
    expect(EQUIPMENT_TYPES.PLANT_CONTROLLER?.canBeSabotaged).toBe(true);
  });
});

describe("fire", () => {
  const burning = (fire: Partial<GameConfig["fire"]>): GameState => {
    const config = noIncidents(noHunters(DEFAULT_CONFIG));
    const s = ship({ ...config, fire: { ...config.fire, ...fire } });
    s.fires = [HERE];
    return s;
  };

  it("does damage: breaks equipment, takes 2 to 4 hull, and costs everyone present 2 HP", () => {
    const s = burning({ spreadChance: 0, breakChance: 1, hullChance: 1 });
    const after = nextCycle(s);
    expect(after.equipment[HERE]!.filter((e) => s.config.repair.chance[e.type] !== undefined).every((e) => e.broken)).toBe(true);
    expect(s.ship.hull - after.ship.hull).toBeGreaterThanOrEqual(2);
    expect(s.ship.hull - after.ship.hull).toBeLessThanOrEqual(4);
    expect(player(after, "p0").hp).toBe(player(s, "p0").hp - s.config.fire.damage);
    expect(player(after, "p2").hp).toBe(player(s, "p2").hp);
    expect(after.fires).toEqual([HERE]);
  });

  it("also breaks the breakable items on the floor, destroys the consumable ones, and spares carried and unbreakable ones", () => {
    const s = burning({ spreadChance: 0, breakChance: 1, hullChance: 0 });
    const floor = { kind: "room" as const, id: HERE };
    s.items.push(
      { id: "knife-floor", type: "knife", at: floor },
      { id: "soap-floor", type: "soap", at: floor },
      { id: "grenade-floor", type: "grenade", at: floor },
      { id: "knife-carried", type: "knife", at: { kind: "player", id: "p0" } },
      { id: "knife-elsewhere", type: "knife", at: { kind: "room", id: ELSEWHERE } },
    );
    const after = nextCycle(s);
    const item = (id: string) => after.items.find((i) => i.id === id);
    expect(item("knife-floor")?.broken).toBe(true);
    expect(item("soap-floor")).toBeUndefined();
    expect(item("grenade-floor")?.broken).toBeUndefined();
    expect(item("knife-carried")?.broken).toBeUndefined();
    expect(item("knife-elsewhere")?.broken).toBeUndefined();
    // A public line in the room for each: p0 is there, p2 isn't.
    const lines = (who: string, key: string) => viewFor(after, who).log.filter((e) => e.key === key);
    expect(lines("p0", "fireBrokeItem")).toEqual([expect.objectContaining({ params: { item: "knife" } })]);
    expect(lines("p0", "fireDestroyedItem")).toEqual([expect.objectContaining({ params: { item: "soap" } })]);
    expect(lines("p2", "fireBrokeItem")).toEqual([]);
  });

  it("leaves floor items alone when the break roll misses", () => {
    const s = burning({ spreadChance: 0, breakChance: 0, hullChance: 0 });
    s.items.push({ id: "knife-floor", type: "knife", at: { kind: "room", id: HERE } });
    expect(nextCycle(s).items.find((i) => i.id === "knife-floor")?.broken).toBeUndefined();
  });

  it("kills unprotected floor plants (leaving empty hydropots), spares empty pots, carried plants, and misses", () => {
    const s = burning({ spreadChance: 0, breakChance: 1, hullChance: 0 });
    const floor = { kind: "room" as const, id: HERE };
    const plant = { species: "fruit_banana", age: null, thirst: 0 as const, sick: false };
    s.items.push(
      { id: "pot-floor", type: "tree_pot", at: floor, plant: { ...plant } },
      { id: "pot-empty", type: "tree_pot", at: floor },
      { id: "pot-carried", type: "tree_pot", at: { kind: "player", id: "p0" }, plant: { ...plant } },
    );
    const after = nextCycle(s);
    const item = (id: string) => after.items.find((i) => i.id === id);
    expect(item("pot-floor")?.plant).toBeUndefined();
    expect(item("pot-floor")?.broken).toBeUndefined();
    expect(item("pot-empty")?.broken).toBeUndefined();
    expect(item("pot-carried")?.plant).toBeDefined();
    expect(viewFor(after, "p0").log.filter((e) => e.key === "fireKilledPlant")).toEqual([expect.objectContaining({ params: { item: "fruit_banana" } })]);
    expect(viewFor(after, "p2").log.filter((e) => e.key === "fireKilledPlant")).toEqual([]);

    const miss = burning({ spreadChance: 0, breakChance: 0, hullChance: 0 });
    miss.items.push({ id: "pot-floor", type: "tree_pot", at: floor, plant: { ...plant } });
    expect(nextCycle(miss).items.find((i) => i.id === "pot-floor")?.plant).toBeDefined();
  });

  it("protects plants in the Hydroponic Garden while the Hydroponics center isn't broken, including the cycle it breaks", () => {
    const GARDEN = "HYDROPONIC_CENTER";
    const s = burning({ spreadChance: 0, breakChance: 1, hullChance: 0 });
    s.fires = [GARDEN];
    s.players[0]!.room = GARDEN;
    s.items.push({
      id: "garden-pot",
      type: "tree_pot",
      at: { kind: "room", id: GARDEN },
      plant: { species: "fruit_banana", age: null, thirst: 0, sick: false },
    });

    // Cycle 1: PLANT_CONTROLLER starts working, breaks from fire, but the plant is protected for this cycle.
    const after1 = nextCycle(s);
    expect(equipment(after1, "HYDROPONIC_CENTER:PLANT_CONTROLLER").broken).toBe(true);
    expect(after1.items.find((i) => i.id === "garden-pot")?.plant).toBeDefined();
    expect(viewFor(after1, "p0").log.filter((e) => e.key === "fireKilledPlant")).toEqual([]);

    // Cycle 2: PLANT_CONTROLLER is already broken at cycle start, so fire kills the plant (leaving an empty pot).
    const after2 = nextCycle(after1);
    expect(after2.items.find((i) => i.id === "garden-pot")?.plant).toBeUndefined();
    expect(viewFor(after2, "p0").log.filter((e) => e.key === "fireKilledPlant")).toEqual([expect.objectContaining({ params: { item: "fruit_banana" } })]);
  });

  it("protects Hydroponic Garden plants on the cycle an incident breaks the Hydroponics center", () => {
    const GARDEN = "HYDROPONIC_CENTER";
    const config = noHunters(only("equipment_breakdown"));
    const s = ship({
      ...config,
      fire: { ...config.fire, spreadChance: 0, breakChance: 1, hullChance: 0 },
    });
    // Break every other breakable equipment so equipment_breakdown must pick PLANT_CONTROLLER.
    for (const eq of Object.values(s.equipment).flat()) {
      if (eq.id !== "HYDROPONIC_CENTER:PLANT_CONTROLLER" && isBreakable(s, eq.type)) eq.broken = true;
    }
    s.fires = [GARDEN];
    s.incidentPoints = 100;
    s.items.push({
      id: "garden-pot",
      type: "tree_pot",
      at: { kind: "room", id: GARDEN },
      plant: { species: "fruit_banana", age: null, thirst: 0, sick: false },
    });
    const after = nextCycle(s);
    expect(equipment(after, "HYDROPONIC_CENTER:PLANT_CONTROLLER").broken).toBe(true);
    expect(after.items.find((i) => i.id === "garden-pot")?.plant).toBeDefined();
  });

  it("spreads instead of doing damage, at most 2 rooms a cycle, and new fires act from the next cycle", () => {
    const s = burning({ spreadChance: 1 });
    s.fires = [HERE, ELSEWHERE, "CORRIDOR_A"];
    const after = nextCycle(s);
    expect(after.fires).toHaveLength(5);
    expect(player(after, "p0").hp).toBe(player(s, "p0").hp); // the refectory spread, so it did no damage
    expect(globalSystem(after).filter((m) => m.key === "fireStarted")).toHaveLength(2);
  });

  it("is seen only by the living in the burning room", () => {
    const s = burning({});
    expect(viewFor(s, "p0").roomOnFire).toBe(true);
    expect(viewFor(s, "p2").roomOnFire).toBe(false);
  });

  it("extinguish: 1 AP, 50%, with an extinguisher you can reach; a success is public, a failure private", () => {
    const s = burning({});
    expect(offered(s, "p0").filter((a) => a.type === "extinguish")).toEqual([]);
    s.items.push({ id: "x", type: "extinguisher", at: { kind: "room", id: HERE } });
    expect(option(s, "p0", { type: "extinguish", item: "x" })).toMatchObject({ cost: { ap: 1 }, chance: s.config.extinguish.chance });

    const sure = { ...s, config: { ...s.config, extinguish: { ...s.config.extinguish, chance: 1 } } };
    const out = mustApply(sure, "p0", { type: "extinguish", item: "x" });
    expect(out.fires).toEqual([]);
    expect(out.items.some((i) => i.id === "x")).toBe(true);
    expect(out.log.at(-1)).toMatchObject({ key: "fireExtinguished", room: HERE, visibleTo: "all" });

    const never = { ...s, config: { ...s.config, extinguish: { ...s.config.extinguish, chance: 0.0001 } } };
    const failed = mustApply(never, "p0", { type: "extinguish", item: "x" });
    expect(failed.fires).toEqual([HERE]);
    expect(failed.log.find((e) => e.key === "extinguishFailed")).toMatchObject({ visibleTo: ["p0"] });
  });

  it("can't be extinguished from another room, and refusing it leaves state unchanged", () => {
    const s = burning({});
    s.items.push({ id: "x", type: "extinguisher", at: { kind: "player", id: "p2" } });
    expect(offered(s, "p2").filter((a) => a.type === "extinguish")).toEqual([]);
    expect(applyAction(s, "p2", { type: "extinguish", item: "x" })).toEqual({ ok: false, error: "illegal_action" });
  });

  it("starts with two extinguishers in the storage pool", () => {
    expect(DEFAULT_CONFIG.startItems.filter((i) => i.type === "extinguisher")).toEqual([
      { type: "extinguisher", pool: "storage" },
      { type: "extinguisher", pool: "storage" },
    ]);
  });
});

describe("incidents: hidden information", () => {
  it("never sends the pool, and sends fire and broken state only to the room", () => {
    const s = ship();
    s.incidentPoints = 987_654;
    s.fires = [HERE];
    equipment(s, COFFEE).broken = true;
    for (const id of ["p0", "p1", "p2"]) expect(JSON.stringify(viewFor(s, id))).not.toContain("987654");
    expect(viewFor(s, "p2")).toMatchObject({ roomOnFire: false, burningRooms: [] });
    expect(JSON.stringify(viewFor(s, "p2").roomEquipment)).not.toContain("broken");
  });
});
