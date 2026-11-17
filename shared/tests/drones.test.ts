// Support drones (#411): an NPC item that repairs what is broken in its room at each cycle change, else wanders.
import { describe, expect, it } from "vitest";
import { BLUEPRINT_ITEM } from "../src/blueprints.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { breakDoor, doorId, isDoorBroken } from "../src/doors.ts";
import { DRONE_MAX_SERIAL, DRONE_NAMES, droneChance, newDrone } from "../src/drones.ts";
import { fullViewFor } from "../src/fullView.ts";
import { INCIDENT_IDS } from "../src/incidents.ts";
import { MICROWAVE_ITEM, SUPPORT_DRONE_ITEM } from "../src/items.ts";
import { startFire } from "../src/fire.ts";
import { normalizeGame, normalizeItem } from "../src/normalizeState.ts";
import { createGame, viewFor } from "../src/rules.ts";
import type { GameConfig, GameState, ItemState } from "../src/types.ts";
import { makeSeats, mustApply, nextCycle, noHunters, noIncidents, offered, pickSkill, player } from "./support.ts";

const HERE = "REFECTORY";
const ELSEWHERE = "LABORATORY";

const quiet = (config: GameConfig = DEFAULT_CONFIG): GameConfig => noIncidents(noHunters(config));

/** A ship of 3 with nothing in it: p0 and p1 in the refectory, p2 in the laboratory. */
function ship(config: GameConfig = quiet(), seed = 3): GameState {
  const s = createGame(makeSeats(3), { ...config, mushCount: 1, startItems: [], startSkills: [] }, seed);
  for (const p of s.players) p.room = p.id === "p2" ? ELSEWHERE : HERE;
  return s;
}

/** A working drone lying in `room` (or carried by `carrier`), with a fixed name. */
function addDrone(s: GameState, room: string, carrier?: string): ItemState {
  const item: ItemState = {
    id: `drone-${s.nextItemId++}`,
    type: SUPPORT_DRONE_ITEM,
    at: carrier ? { kind: "player", id: carrier } : { kind: "room", id: room },
    drone: { name: "Robbie", serial: 42, upgrades: [], failures: { repair: 0, extinguish: 0, shoot: 0 } },
  };
  s.items.push(item);
  return item;
}

const find = (s: GameState, id: string) => s.items.find((i) => i.id === id)!;
/** The refectory's first piece of equipment that Repair can fix. */
const repairable = (s: GameState) => s.equipment[HERE]!.find((e) => s.config.repair.chance[e.type] !== undefined)!;
/** Every repair always succeeds (chance and cap at 1) or always fails (chance 0). */
const sure = (config: GameConfig, success: boolean): GameConfig => ({
  ...config,
  drones: { ...config.drones, maxChance: success ? 1 : config.drones.maxChance },
  repair: { ...config.repair, chance: Object.fromEntries(Object.keys(config.repair.chance).map((k) => [k, success ? 1 : 0])) },
});
const lines = (s: GameState, key: string) => s.log.filter((e) => e.key === key);

describe("support drones: state", () => {
  it("the starting drone in the front corridor gets a name and a serial from the seeded RNG, the same for the same seed", () => {
    const a = createGame(makeSeats(3), DEFAULT_CONFIG, 7);
    const b = createGame(makeSeats(3), DEFAULT_CONFIG, 7);
    const drone = a.items.find((i) => i.type === SUPPORT_DRONE_ITEM)!;
    expect(drone.at).toEqual({ kind: "room", id: "CORRIDOR_A" });
    expect(DRONE_NAMES).toContain(drone.drone!.name);
    expect(drone.drone!.serial).toBeGreaterThanOrEqual(1);
    expect(drone.drone!.serial).toBeLessThanOrEqual(DRONE_MAX_SERIAL);
    expect(drone.drone!.failures).toEqual({ repair: 0, extinguish: 0, shoot: 0 });
    expect(b.items.find((i) => i.type === SUPPORT_DRONE_ITEM)!.drone).toEqual(drone.drone);
  });

  it("names come from a stream with its own seed: another npcSeed changes the drone and nothing else; the same one, nothing", () => {
    const a = createGame(makeSeats(16), DEFAULT_CONFIG, 7, {}, 1, 100);
    const b = createGame(makeSeats(16), DEFAULT_CONFIG, 7, {}, 1, 100);
    const others = [101, 102, 103, 104, 105].map((npcSeed) => createGame(makeSeats(16), DEFAULT_CONFIG, 7, {}, 1, npcSeed));
    const drone = (s: GameState) => s.items.find((i) => i.type === SUPPORT_DRONE_ITEM)!.drone;
    expect(drone(b)).toEqual(drone(a));
    expect(others.some((o) => drone(o)!.name !== drone(a)!.name || drone(o)!.serial !== drone(a)!.serial)).toBe(true);
    const rest = (s: GameState) => ({ ...s, npcs: null, items: s.items.map(({ drone: _d, ...i }) => i) });
    for (const o of others) expect(rest(o)).toEqual(rest(a));
  });

  it("drones get every name once before any repeats, and a built drone doesn't draw on the game's stream", () => {
    const s = ship();
    const names = Array.from({ length: DRONE_NAMES.length }, () => newDrone(s).name);
    expect(new Set(names)).toEqual(new Set(DRONE_NAMES));
    const rng = s.rng;
    expect(DRONE_NAMES).toContain(newDrone(s).name);
    expect(s.npcs.droneNames).toHaveLength(DRONE_NAMES.length - 1);
    expect(s.rng).toBe(rng);
  });

  it("a game saved before the NPCs had a stream gets one; the queue round-trips and stays out of every view", () => {
    const s = ship();
    newDrone(s);
    const stored = JSON.parse(JSON.stringify(s));
    expect(normalizeGame(stored, {}).npcs).toEqual(s.npcs);
    delete stored.npcs;
    expect(normalizeGame(stored, {}).npcs).toEqual({ rng: expect.any(Number), droneNames: [] });
    for (const id of ["p0", "p1", "p2"]) expect(JSON.stringify(viewFor(s, id))).not.toContain(s.npcs.droneNames[0]!);
    expect(fullViewFor(s, null)).not.toHaveProperty("npcs");
  });

  it("a saved drone round-trips through the normalizer; one saved without state gets it on its first turn", () => {
    const s = ship();
    const item = addDrone(s, HERE);
    expect(normalizeItem(JSON.parse(JSON.stringify(item)))).toEqual(item);
    delete item.drone;
    const after = nextCycle(s);
    expect(DRONE_NAMES).toContain(find(after, item.id).drone!.name);
  });

  it("its chance is the base x 1.25 per failure in a row, capped at 99%", () => {
    const s = ship();
    expect(droneChance(s, 0.12, 0)).toBeCloseTo(0.12);
    expect(droneChance(s, 0.12, 1)).toBeCloseTo(0.15);
    expect(droneChance(s, 0.12, 2)).toBeCloseTo(0.1875);
    expect(droneChance(s, 0.12, 50)).toBe(0.99);
  });

  it("can't be hidden", () => {
    const s = ship();
    const item = addDrone(s, HERE, "p0");
    expect(offered(s, "p0")).not.toContainEqual({ type: "hide", item: item.id });
  });
});

describe("support drones: repairs", () => {
  it("repairs broken equipment in its room with a public line, and stays put", () => {
    const s = ship(sure(quiet(), true));
    const drone = addDrone(s, HERE);
    const target = repairable(s);
    target.broken = true;
    const after = nextCycle(s);
    expect(after.equipment[HERE]!.find((e) => e.id === target.id)!.broken).toBeUndefined();
    expect(find(after, drone.id).at).toEqual({ kind: "room", id: HERE });
    expect(lines(after, "droneRepaired")).toEqual([expect.objectContaining({ room: HERE, visibleTo: "all", params: { drone: "Robbie", serial: 42, equipment: target.type } })]);
  });

  it("a failure counts up, leaves the equipment broken and logs it; a success resets the count", () => {
    const s = ship(sure(quiet(), false));
    const drone = addDrone(s, HERE);
    repairable(s).broken = true;
    let after = nextCycle(s);
    after = nextCycle(after);
    expect(find(after, drone.id).drone!.failures.repair).toBe(2);
    expect(repairable(after).broken).toBe(true);
    expect(lines(after, "droneRepairFailed")).toHaveLength(2);
    after.config = sure(after.config, true);
    after = nextCycle(after);
    expect(repairable(after).broken).toBeUndefined();
    expect(find(after, drone.id).drone!.failures.repair).toBe(0);
  });

  it("repairs a broken item on the floor, but never a hidden one or one someone carries", () => {
    const s = ship(sure(quiet(), true));
    // Enough failures in a row that the item's own 25% reaches the cap of 1.
    addDrone(s, HERE).drone!.failures.repair = 20;
    const hidden: ItemState = { id: "mw-hidden", type: MICROWAVE_ITEM, at: { kind: "room", id: HERE }, broken: true, hiddenBy: "p0" };
    const carried: ItemState = { id: "mw-carried", type: MICROWAVE_ITEM, at: { kind: "player", id: "p0" }, broken: true };
    const floor: ItemState = { id: "mw-floor", type: MICROWAVE_ITEM, at: { kind: "room", id: HERE }, broken: true };
    s.items.push(hidden, carried, floor);
    const after = nextCycle(s);
    expect(find(after, "mw-floor").broken).toBeUndefined();
    expect(find(after, "mw-hidden").broken).toBe(true);
    expect(find(after, "mw-carried").broken).toBe(true);
    expect(lines(after, "droneRepairedItem")).toEqual([expect.objectContaining({ params: { drone: "Robbie", serial: 42, item: MICROWAVE_ITEM } })]);
    // Nothing left it may repair: it wanders off instead.
    const later = nextCycle(after);
    expect(find(later, "mw-hidden").broken).toBe(true);
    expect(lines(later, "droneLeft")).toHaveLength(1);
  });

  it("a carried drone repairs in its carrier's room, then with nothing to repair leaves the inventory for a neighbouring room", () => {
    const s = ship(sure(quiet(), true));
    const drone = addDrone(s, HERE, "p0");
    repairable(s).broken = true;
    let after = nextCycle(s);
    expect(repairable(after).broken).toBeUndefined();
    expect(find(after, drone.id).at).toEqual({ kind: "player", id: "p0" });
    after = nextCycle(after);
    const at = find(after, drone.id).at;
    expect(at.kind).toBe("room");
    expect(s.config.rooms[HERE]).toContain(at.id);
    expect(lines(after, "droneLeft")).toEqual([expect.objectContaining({ room: HERE, params: { drone: "Robbie", serial: 42, room: at.id } })]);
  });

  it("a broken drone does nothing", () => {
    const s = ship(sure(quiet(), true));
    const drone = addDrone(s, HERE);
    drone.broken = true;
    repairable(s).broken = true;
    const after = nextCycle(s);
    expect(repairable(after).broken).toBe(true);
    expect(find(after, drone.id).at).toEqual({ kind: "room", id: HERE });
    expect(after.log.filter((e) => e.key.startsWith("drone"))).toEqual([]);
  });

  it("repairs a broken door in its room (success clears broken state and logs droneRepairedDoor; failure increments failures.repair and logs droneRepairFailedDoor)", () => {
    const other = DEFAULT_CONFIG.rooms[HERE]![0]!;
    const id = doorId(HERE, other);

    const sFail = ship(sure(quiet(), false));
    const failing = addDrone(sFail, HERE);
    breakDoor(sFail, id);
    const afterFail = nextCycle(sFail);
    expect(isDoorBroken(afterFail, HERE, other)).toBe(true);
    expect(find(afterFail, failing.id).drone!.failures.repair).toBe(1);
    expect(find(afterFail, failing.id).at).toEqual({ kind: "room", id: HERE });
    expect(lines(afterFail, "droneRepairFailedDoor")).toEqual([
      expect.objectContaining({ room: HERE, visibleTo: "all", params: { drone: "Robbie", serial: 42, room: other } }),
    ]);

    const sOk = ship(sure(quiet(), true));
    const working = addDrone(sOk, HERE);
    breakDoor(sOk, id);
    const afterOk = nextCycle(sOk);
    expect(isDoorBroken(afterOk, HERE, other)).toBe(false);
    expect(find(afterOk, working.id).drone!.failures.repair).toBe(0);
    expect(find(afterOk, working.id).at).toEqual({ kind: "room", id: HERE });
    expect(lines(afterOk, "droneRepairedDoor")).toEqual([
      expect.objectContaining({ room: HERE, visibleTo: "all", params: { drone: "Robbie", serial: 42, room: other } }),
    ]);
  });
});

describe("support drones: moving", () => {
  it("with nothing to repair, a drone on the floor moves to a neighbouring room, with a line in each", () => {
    const s = ship();
    const drone = addDrone(s, HERE);
    const after = nextCycle(s);
    const to = (find(after, drone.id).at as { id: string }).id;
    expect(s.config.rooms[HERE]).toContain(to);
    expect(lines(after, "droneLeft")).toEqual([expect.objectContaining({ room: HERE, visibleTo: "all", params: { drone: "Robbie", serial: 42, room: to } })]);
    expect(lines(after, "droneEntered")).toEqual([expect.objectContaining({ room: to, visibleTo: "all", params: { drone: "Robbie", serial: 42, room: HERE } })]);
  });

  it("goes to random rooms: from the front corridor, different seeds take it to more than one neighbour", () => {
    const rooms = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const s = ship(quiet(), seed);
      const drone = addDrone(s, "CORRIDOR_A");
      rooms.add((find(nextCycle(s), drone.id).at as { id: string }).id);
    }
    expect(rooms.size).toBeGreaterThan(1);
  });

  it("replays the same: the same seed and moves give the same drones", () => {
    const run = () => {
      let s = createGame(makeSeats(3), quiet(), 11);
      for (let i = 0; i < 12; i++) s = nextCycle(s);
      return s.items.filter((i) => i.type === SUPPORT_DRONE_ITEM);
    };
    expect(run()).toEqual(run());
  });

  it("a sensor drone steps toward a reachable room with a broken door, and falls back to wandering if no broken door is reachable", () => {
    const s = ship();
    const drone = addDrone(s, "CORRIDOR_A");
    drone.drone!.upgrades = ["sensor"];
    breakDoor(s, doorId("SPACESHIP_BAY_A", "STORAGE_A_0"));
    const after = nextCycle(s);
    expect(find(after, drone.id).at).toEqual({ kind: "room", id: "CORRIDOR_B" });

    // Disconnected component with a broken door: unreachable from CORRIDOR_A, so it wanders randomly.
    const rooms = new Set<string>();
    const isolatedConfig: GameConfig = {
      ...quiet(),
      rooms: {
        ...quiet().rooms,
        ISOLATED_A: ["ISOLATED_B"],
        ISOLATED_B: ["ISOLATED_A"],
      },
    };
    for (let seed = 1; seed <= 20; seed++) {
      const s2 = ship(isolatedConfig, seed);
      const d2 = addDrone(s2, "CORRIDOR_A");
      d2.drone!.upgrades = ["sensor"];
      breakDoor(s2, doorId("ISOLATED_A", "ISOLATED_B"));
      rooms.add((find(nextCycle(s2), d2.id).at as { id: string }).id);
    }
    expect(rooms.size).toBeGreaterThan(1);
  });
});

describe("support drones: breaking", () => {
  it("fire breaks a drone on the floor", () => {
    const s = ship(quiet({ ...DEFAULT_CONFIG, fire: { ...DEFAULT_CONFIG.fire, spreadChance: 0, breakChance: 1, hullChance: 0 } }));
    const drone = addDrone(s, HERE);
    startFire(s, HERE);
    const after = nextCycle(s);
    expect(find(after, drone.id).broken).toBe(true);
    expect(lines(after, "fireBrokeItem")).toContainEqual(expect.objectContaining({ params: { item: SUPPORT_DRONE_ITEM } }));
  });

  it("an electrical overload breaks drones on the floor of the room, not carried ones", () => {
    const base = noHunters(DEFAULT_CONFIG);
    const config: GameConfig = {
      ...base,
      incidents: {
        ...base.incidents,
        rollPoints: 1,
        catalog: Object.fromEntries(INCIDENT_IDS.map((i) => [i, { ...base.incidents.catalog[i], weight: i === "electrical_overload" ? 1 : 0 }])) as GameConfig["incidents"]["catalog"],
      },
    };
    const s = ship(config);
    // Only the refectory has anything left to break.
    for (const [room, list] of Object.entries(s.equipment)) if (room !== HERE) for (const e of list) e.broken = true;
    s.incidentPoints = 7;
    const floor = addDrone(s, HERE);
    const carried = addDrone(s, HERE, "p0");
    const after = nextCycle(s);
    expect(find(after, floor.id).broken).toBe(true);
    expect(find(after, carried.id).broken).toBeUndefined();
  });
});

describe("support drones: getting one", () => {
  it("the Robotics Expert gets a drone blueprint when picking the skill", () => {
    const s = pickSkill(ship(), "p0", "robotics");
    expect(s.items).toContainEqual(expect.objectContaining({ type: BLUEPRINT_ITEM, builds: "SUPPORT_DRONE", at: { kind: "player", id: "p0" } }));
  });

  it("Build makes a named drone from 4 metal scraps and 1 plastic scrap", () => {
    const s = ship();
    const mine = { kind: "player" as const, id: "p0" };
    s.items.push({ id: "bp", type: BLUEPRINT_ITEM, builds: "SUPPORT_DRONE", at: mine });
    for (let i = 0; i < 4; i++) s.items.push({ id: `metal-${i}`, type: "metal_scraps", at: { kind: "room", id: HERE } });
    s.items.push({ id: "plastic", type: "plastic_scraps", at: mine });
    player(s, "p0").ap = 10;
    const after = mustApply(s, "p0", { type: "build", item: "bp" });
    const drone = after.items.find((i) => i.type === SUPPORT_DRONE_ITEM)!;
    expect(drone.at).toEqual(mine);
    expect(DRONE_NAMES).toContain(drone.drone!.name);
    expect(after.items.some((i) => i.type === "metal_scraps" || i.type === "plastic_scraps" || i.id === "bp")).toBe(false);
  });
});

describe("support drones: views", () => {
  it("everyone who sees a drone gets its name, serial and upgrades, and nobody its failure counts", () => {
    const s = ship();
    const floor = addDrone(s, HERE);
    floor.drone!.failures = { repair: 3, extinguish: 0, shoot: 0 };
    addDrone(s, HERE, "p0").drone!.failures.repair = 5;
    for (const id of ["p0", "p1", "p2"]) {
      const view = viewFor(s, id);
      expect(JSON.stringify(view)).not.toContain("failures");
      if (id !== "p2") expect(view.roomItems.find((i) => i.id === floor.id)!.drone).toEqual({ name: "Robbie", serial: 42, upgrades: [] });
    }
    expect(viewFor(s, "p0").inventory.find((i) => i.type === SUPPORT_DRONE_ITEM)!.drone).toEqual({ name: "Robbie", serial: 42, upgrades: [] });
  });
});
