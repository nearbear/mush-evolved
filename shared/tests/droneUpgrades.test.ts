// Drone upgrades (#412, #413): a Robotics Expert's Upgrade action, Firefighter, Turbo and Sensor.
import { describe, expect, it } from "vitest";
import { ACTIONS } from "../src/actions.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { DRONE_UPGRADES, droneChance } from "../src/drones.ts";
import { startFire } from "../src/fire.ts";
import { MICROWAVE_ITEM, SUPPORT_DRONE_ITEM } from "../src/itemIds.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { GameConfig, GameState, ItemState } from "../src/types.ts";
import { clone, costOf, makeSeats, mustApply, nextCycle, offered, pickSkill, player, testConfig } from "./support.ts";

const HERE = "REFECTORY";
const ELSEWHERE = "LABORATORY";

/** No hunters or incidents; fire neither spreads, breaks nor hurts the hull unless a test says so. */
function quiet(fire: Partial<GameConfig["fire"]> = {}): GameConfig {
  return testConfig({ fire: { spreadChance: 0, breakChance: 0, hullChance: 0, ...fire } });
}

/** A ship of 3 with nothing in it: p0 and p1 in the refectory, p2 in the laboratory. */
function ship(config: GameConfig = quiet(), seed = 3): GameState {
  const s = createGame(makeSeats(3), { ...config, mushCount: 1, startItems: [], startSkills: [] }, seed);
  for (const p of s.players) p.room = p.id === "p2" ? ELSEWHERE : HERE;
  // Nothing broken anywhere, so a drone with nothing to put out wanders.
  for (const list of Object.values(s.equipment)) for (const e of list) delete e.broken;
  return s;
}

function addDrone(s: GameState, room: string, opts: { carrier?: string; upgrades?: string[] } = {}): ItemState {
  const item: ItemState = {
    id: `drone-${s.nextItemId++}`,
    type: SUPPORT_DRONE_ITEM,
    at: opts.carrier ? { kind: "player", id: opts.carrier } : { kind: "room", id: room },
    drone: { name: "Robbie", serial: 42, upgrades: [...(opts.upgrades ?? [])], failures: { repair: 0, extinguish: 0, shoot: 0 } },
  };
  s.items.push(item);
  return item;
}

function addScrap(s: GameState, at: ItemState["at"], type = "metal_scraps"): string {
  const id = `scrap-${s.nextItemId++}`;
  s.items.push({ id, type, at });
  return id;
}

/** Why `id` may not upgrade, as the action's own check says (applyAction only reports "illegal_action"), or null. */
const refusal = (s: GameState, id: string, item: string, upgrade: string) => ACTIONS.upgrade_drone.check(s, player(s, id), { type: "upgrade_drone", item, upgrade });

const find = (s: GameState, id: string) => s.items.find((i) => i.id === id);
const lines = (s: GameState, key: string) => s.log.filter((e) => e.key === key);
const mine = { kind: "player" as const, id: "p0" };
const floor = { kind: "room" as const, id: HERE };

/** p0 is a Robotics Expert with plenty of AP, no dirt or injury risk, two metal scraps on the floor and a drone. */
function workshop(config: GameConfig = quiet()): { s: GameState; drone: ItemState } {
  const calm: GameConfig = { ...config, drones: { ...config.drones, upgrade: { ...config.drones.upgrade, dirtyChance: 0, injuryChance: 0 } } };
  const s = pickSkill(ship(calm), "p0", "robotics");
  player(s, "p0").ap = 10;
  addScrap(s, floor);
  addScrap(s, floor);
  return { s, drone: addDrone(s, HERE) };
}

describe("drone upgrades: the action", () => {
  it("costs 2 AP and 2 metal scraps, with 25% dirt and 5% injury; Turbo's second turn is 80%", () => {
    const { cost, scraps, dirtyChance, injuryChance } = DEFAULT_CONFIG.drones.upgrade;
    expect([cost.ap, scraps, dirtyChance, injuryChance, DEFAULT_CONFIG.drones.turboChance]).toEqual([2, 2, 0.25, 0.05, 0.8]);
    expect([...DRONE_UPGRADES]).toEqual(["firefighter", "turbo", "sensor"]);
  });

  it("only a Robotics Expert is offered it, one option per upgrade the drone lacks, at the config's AP", () => {
    const { s, drone } = workshop();
    const upgrades = (id: string) => offered(s, id).filter((a) => a.type === "upgrade_drone");
    expect(upgrades("p0")).toEqual(DRONE_UPGRADES.map((upgrade) => ({ type: "upgrade_drone", item: drone.id, upgrade })));
    expect(costOf(s, "p0", { type: "upgrade_drone" })).toEqual(expect.objectContaining({ ap: s.config.drones.upgrade.cost.ap }));
    expect(upgrades("p1")).toEqual([]);
    expect(refusal(s, "p1", drone.id, "turbo")).toBe("no_skill");
  });

  it("fits the upgrade, takes the AP and two metal scraps, and says so publicly in the room", () => {
    const { s, drone } = workshop();
    const after = mustApply(s, "p0", { type: "upgrade_drone", item: drone.id, upgrade: "firefighter" });
    expect(find(after, drone.id)!.drone!.upgrades).toEqual(["firefighter"]);
    expect(player(after, "p0").ap).toBe(10 - s.config.drones.upgrade.cost.ap);
    expect(after.items.some((i) => i.type === "metal_scraps")).toBe(false);
    const line = lines(after, "droneUpgraded");
    expect(line).toEqual([expect.objectContaining({ params: { name: player(s, "p0").character, drone: "Robbie", serial: 42, upgrade: "firefighter" } })]);
    expect(viewFor(after, "p1").log.some((e) => e.key === "droneUpgraded")).toBe(true);
    expect(viewFor(after, "p2").log.some((e) => e.key === "droneUpgraded")).toBe(false);
    // Anyone examining the drone sees it.
    expect(viewFor(after, "p1").roomItems.find((i) => i.id === drone.id)!.drone!.upgrades).toEqual(["firefighter"]);
  });

  it("uses metal scraps from the inventory first, then the room's; plastic scraps don't count", () => {
    const { s, drone } = workshop();
    const roomScraps = s.items.filter((i) => i.type === "metal_scraps").map((i) => i.id);
    const carried = addScrap(s, mine);
    const plastic = addScrap(s, mine, "plastic_scraps");
    const after = mustApply(s, "p0", { type: "upgrade_drone", item: drone.id, upgrade: "turbo" });
    expect(find(after, carried)).toBeUndefined();
    expect(find(after, roomScraps[0]!)).toBeUndefined();
    expect(find(after, roomScraps[1]!)).toBeDefined();
    expect(find(after, plastic)).toBeDefined();
  });

  it("with fewer than two metal scraps nothing is offered, and it's refused", () => {
    const { s, drone } = workshop();
    s.items = s.items.filter((i) => i.id !== s.items.find((j) => j.type === "metal_scraps")!.id);
    addScrap(s, mine, "plastic_scraps");
    expect(offered(s, "p0").some((a) => a.type === "upgrade_drone")).toBe(false);
    expect(refusal(s, "p0", drone.id, "turbo")).toBe("no_scrap");
  });

  it("never fits an upgrade twice, nor one that isn't offered (Pilot); the state is unchanged", () => {
    const { s, drone } = workshop();
    drone.drone!.upgrades = ["firefighter", "sensor"];
    expect(offered(s, "p0").filter((a) => a.type === "upgrade_drone")).toEqual([{ type: "upgrade_drone", item: drone.id, upgrade: "turbo" }]);
    const before = clone(s);
    expect(refusal(s, "p0", drone.id, "firefighter")).toBe("already_upgraded");
    expect(refusal(s, "p0", drone.id, "pilot")).toBe("cant_upgrade");
    expect(s).toEqual(before);
    drone.drone!.upgrades = [...DRONE_UPGRADES];
    expect(offered(s, "p0").some((a) => a.type === "upgrade_drone")).toBe(false);
  });

  it("reaches a drone it carries, not one in someone else's inventory, another room, or a broken one", () => {
    const { s, drone } = workshop();
    drone.at = mine;
    const theirs = addDrone(s, HERE, { carrier: "p1" });
    const away = addDrone(s, ELSEWHERE);
    const broken = addDrone(s, HERE);
    broken.broken = true;
    const items = new Set(offered(s, "p0").flatMap((a) => (a.type === "upgrade_drone" ? [a.item] : [])));
    expect(items).toEqual(new Set([drone.id]));
    for (const other of [theirs, away]) expect(refusal(s, "p0", other.id, "turbo")).toBe("cant_upgrade");
    expect(applyAction(s, "p0", { type: "upgrade_drone", item: broken.id, upgrade: "turbo" }).ok).toBe(false);
  });

  it("a drone saved without state gets it when upgraded", () => {
    const { s, drone } = workshop();
    delete drone.drone;
    const after = mustApply(s, "p0", { type: "upgrade_drone", item: drone.id, upgrade: "turbo" });
    expect(find(after, drone.id)!.drone!.upgrades).toEqual(["turbo"]);
  });
});

/** Extinguish and repair always succeed (chance and cap at 1) or always fail (chance 0). */
function sure(config: GameConfig, success: boolean): GameConfig {
  return {
    ...config,
    drones: { ...config.drones, maxChance: success ? 1 : config.drones.maxChance },
    extinguish: { ...config.extinguish, chance: success ? 1 : 0 },
    repair: { ...config.repair, chance: Object.fromEntries(Object.keys(config.repair.chance).map((k) => [k, success ? 1 : 0])) },
  };
}

describe("drone upgrades: Firefighter", () => {
  it("puts out the fire in its room, publicly, before repairing anything there", () => {
    const s = ship(sure(quiet(), true));
    const drone = addDrone(s, HERE, { upgrades: ["firefighter"] });
    const equipment = s.equipment[HERE]!.find((e) => s.config.repair.chance[e.type] !== undefined)!;
    equipment.broken = true;
    startFire(s, HERE);
    const after = nextCycle(s);
    expect(after.fires).not.toContain(HERE);
    expect(after.equipment[HERE]!.find((e) => e.id === equipment.id)!.broken).toBe(true);
    expect(lines(after, "droneExtinguished")).toEqual([expect.objectContaining({ room: HERE, params: { drone: "Robbie", serial: 42 } })]);
    expect(find(after, drone.id)!.at).toEqual(floor);
  });

  it("a carried Firefighter drone fights its carrier's room's fire", () => {
    const s = ship(sure(quiet(), true));
    addDrone(s, HERE, { carrier: "p2", upgrades: ["firefighter"] });
    startFire(s, ELSEWHERE);
    expect(nextCycle(s).fires).not.toContain(ELSEWHERE);
  });

  it("a drone without it leaves the fire alone", () => {
    const s = ship(sure(quiet(), true));
    addDrone(s, HERE);
    startFire(s, HERE);
    const after = nextCycle(s);
    expect(after.fires).toContain(HERE);
    expect(lines(after, "droneExtinguished")).toEqual([]);
  });

  it("rolls Extinguish's base chance raised by its own failure count, which a failure adds to and a success resets", () => {
    const s = ship(sure(quiet(), false));
    const drone = addDrone(s, HERE, { upgrades: ["firefighter"] });
    drone.drone!.failures.repair = 2;
    startFire(s, HERE);
    const failed = nextCycle(s);
    expect(failed.fires).toContain(HERE);
    expect(find(failed, drone.id)!.drone!.failures).toEqual({ repair: 2, extinguish: 1, shoot: 0 });
    expect(lines(failed, "droneExtinguishFailed")).toHaveLength(1);
    expect(droneChance(s, DEFAULT_CONFIG.extinguish.chance, 1)).toBe(DEFAULT_CONFIG.extinguish.chance * 1.25);
    expect(droneChance(s, DEFAULT_CONFIG.extinguish.chance, 20)).toBe(0.99);
    const retry = clone(failed);
    retry.config = sure(retry.config, true);
    const done = nextCycle(retry);
    expect(done.fires).not.toContain(HERE);
    expect(find(done, drone.id)!.drone!.failures.extinguish).toBe(0);
  });

  it("fire never breaks it; it still breaks a drone without the upgrade", () => {
    // The fire is never put out, so it burns at the next cycle change with a sure break.
    const s = ship(sure(quiet({ breakChance: 1 }), false));
    const fireproof = addDrone(s, HERE, { upgrades: ["firefighter"] });
    const plain = addDrone(s, HERE);
    startFire(s, HERE);
    const after = nextCycle(s);
    expect(find(after, fireproof.id)!.broken).toBeUndefined();
    expect(find(after, plain.id)!.broken).toBe(true);
  });
});

describe("drone upgrades: Turbo", () => {
  const turbo = (chance: number): GameConfig => ({ ...quiet(), drones: { ...quiet().drones, turboChance: chance } });

  it("a sure roll gives a full second turn, never a third: with nothing to do it moves twice", () => {
    const s = ship(turbo(1));
    addDrone(s, HERE, { upgrades: ["turbo"] });
    const after = nextCycle(s);
    const left = lines(after, "droneLeft");
    expect(left).toHaveLength(2);
    expect(left[0]!.room).toBe(HERE);
    expect(left[1]!.room).toBe(left[0]!.params!.room);
  });

  it("a failed roll, or no Turbo, gives one turn", () => {
    for (const [config, upgrades] of [[turbo(0), ["turbo"]], [turbo(1), []]] as const) {
      const s = ship(config);
      addDrone(s, HERE, { upgrades: [...upgrades] });
      expect(lines(nextCycle(s), "droneLeft")).toHaveLength(1);
    }
  });

  it("the second turn works too: a Firefighter Turbo drone puts out the fire, then repairs", () => {
    const s = ship(sure(turbo(1), true));
    addDrone(s, HERE, { upgrades: ["firefighter", "turbo"] });
    const equipment = s.equipment[HERE]!.find((e) => s.config.repair.chance[e.type] !== undefined)!;
    equipment.broken = true;
    startFire(s, HERE);
    const after = nextCycle(s);
    expect(after.fires).not.toContain(HERE);
    expect(after.equipment[HERE]!.find((e) => e.id === equipment.id)!.broken).toBeUndefined();
    expect(lines(after, "droneLeft")).toEqual([]);
  });
});

describe("drone upgrades: Sensor", () => {
  const stepOf = (s: GameState, id: string) => (find(nextCycle(s), id)!.at as { kind: "room"; id: string }).id;

  it("steps along shortestPath toward the nearest broken repairable equipment or floor item, ignoring hidden and carried items", () => {
    // From CORRIDOR_A: CORRIDOR_B -> REFECTORY (2 steps) vs CORRIDOR_B -> SPACESHIP_BAY_A -> STORAGE_A_0 (3 steps).
    const s = ship();
    const drone = addDrone(s, "CORRIDOR_A", { upgrades: ["sensor"] });
    s.equipment.STORAGE_A_0![0]!.broken = true;
    s.items.push({ id: "mw-hidden", type: MICROWAVE_ITEM, at: { kind: "room", id: "COMMAND_CENTER" }, broken: true, hiddenBy: "p0" });
    s.items.push({ id: "mw-carried", type: MICROWAVE_ITEM, at: { kind: "player", id: "p0" }, broken: true });
    expect(stepOf(s, drone.id)).toBe("CORRIDOR_B");

    // A closer broken floor item in SICK_BAY (1 step from CORRIDOR_A) wins over STORAGE_A_0 (3 steps).
    s.items.push({ id: "mw-floor", type: MICROWAVE_ITEM, at: { kind: "room", id: "SICK_BAY" }, broken: true });
    expect(stepOf(s, drone.id)).toBe("SICK_BAY");
  });

  it("prefers a burning room over broken equipment only when it also has Firefighter", () => {
    const base = ship();
    // From CORRIDOR_A: LABORATORY is 1 step away; NEXUS_ROOM is 3 steps away via CORRIDOR_B -> SPACESHIP_BAY_B -> CORRIDOR_C.
    base.equipment.LABORATORY![0]!.broken = true;
    startFire(base, "NEXUS_ROOM");

    const withFirefighter = clone(base);
    const ffDrone = addDrone(withFirefighter, "CORRIDOR_A", { upgrades: ["sensor", "firefighter"] });
    expect(stepOf(withFirefighter, ffDrone.id)).toBe("CORRIDOR_B");

    const sensorOnly = clone(base);
    const plainDrone = addDrone(sensorOnly, "CORRIDOR_A", { upgrades: ["sensor"] });
    expect(stepOf(sensorOnly, plainDrone.id)).toBe("LABORATORY");
  });

  it("without Firefighter, ignores a burning room and falls back to random moves when nothing is broken", () => {
    const rooms = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const s = ship(quiet(), seed);
      const drone = addDrone(s, "CORRIDOR_A", { upgrades: ["sensor"] });
      startFire(s, "COMMAND_CENTER");
      rooms.add(stepOf(s, drone.id));
    }
    expect(rooms.size).toBeGreaterThan(1);
  });

  it("breaks distance ties by door order in config.rooms", () => {
    const s = ship();
    // From CORRIDOR_A: COMMAND_CENTER (ASTRO_MODULE) and LABORATORY (RESEARCH_LAB) are both 1 door away.
    s.equipment.COMMAND_CENTER![0]!.broken = true;
    s.equipment.LABORATORY![0]!.broken = true;
    const drone = addDrone(s, "CORRIDOR_A", { upgrades: ["sensor"] });
    expect(stepOf(s, drone.id)).toBe("COMMAND_CENTER");

    const reversed = clone(s);
    reversed.config = {
      ...reversed.config,
      rooms: { ...reversed.config.rooms, CORRIDOR_A: [...reversed.config.rooms.CORRIDOR_A!].reverse() },
    };
    expect(stepOf(reversed, drone.id)).toBe("LABORATORY");
  });

  it("falls back to a random move with no target, even when hunters are attacking (Pilot is phase 5)", () => {
    const rooms = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const s = ship(quiet(), seed);
      s.hunters.list.push({ id: "h1", hp: 5, target: null, misses: 0 });
      const drone = addDrone(s, "CORRIDOR_A", { upgrades: ["sensor"] });
      rooms.add(stepOf(s, drone.id));
    }
    expect(rooms.size).toBeGreaterThan(1);
  });

  it("adds nothing to other rooms' player views when heading toward a distant fire or broken item", () => {
    const s = ship();
    const drone = addDrone(s, "CORRIDOR_A", { upgrades: ["sensor", "firefighter"] });
    s.equipment.NEXUS_ROOM![0]!.broken = true;
    startFire(s, "MOTOR_ROOM");
    const after = nextCycle(s);
    // p0 in REFECTORY and p2 in LABORATORY see neither the fire in MOTOR_ROOM, the broken equipment in NEXUS_ROOM, nor the drone's move in CORRIDOR_A -> CORRIDOR_B.
    for (const id of ["p0", "p2"]) {
      const view = viewFor(after, id);
      expect(view.roomOnFire).toBe(false);
      expect(view.burningRooms).toEqual([]);
      expect(view.log.some((e) => e.key.startsWith("drone"))).toBe(false);
      const visible = JSON.stringify({ log: view.log, chat: view.chat, roomItems: view.roomItems, roomEquipment: view.roomEquipment });
      expect(visible).not.toContain("MOTOR_ROOM");
      expect(visible).not.toContain("NEXUS_ROOM");
    }
    expect((find(after, drone.id)!.at as { id: string }).id).toBe("CORRIDOR_B");
  });
});
