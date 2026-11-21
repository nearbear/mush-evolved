// Doors (#330, slice 1): the door model and blocking. A broken door stops everyone, both rooms it joins see it, and no
// one else learns its state.
import { describe, expect, it } from "vitest";
import { walk } from "../src/actions/summon.ts";
import { WRENCH_ITEM } from "../src/actions/repair.ts";
import { actionTarget, endsAccommodation } from "../src/actionTarget.ts";
import { CHEAT_ROOM } from "../src/cheatRoom.ts";
import { DEFAULT_CONFIG, resolveConfig } from "../src/config.ts";
import { allDoors, breakDoor, doorId, doorRooms, doorsOf, isDoor, isDoorBroken, repairDoor } from "../src/doors.ts";
import { startFire } from "../src/fire.ts";
import { SUPPORT_DRONE_ITEM } from "../src/items.ts";
import { normalizeGame, overridesOf } from "../src/normalizeState.ts";
import { shortestPath } from "../src/paths.ts";
import { PROJECT_COMPLETE } from "../src/projects.ts";
import { applyInput } from "../src/replay.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { doorCount, viewPath } from "../src/situation.ts";
import type { GameState, ItemState } from "../src/types.ts";
import { CAMERA_EQUIPMENT } from "../src/equipment.ts";
import { clone, costOf, makeSeats, mustApply, nextCycle, nextDay, offered, option, player, testConfig } from "./support.ts";

const LAB_DOOR = doorId("CORRIDOR_A", "LABORATORY");
const quiet = testConfig();

/** p0 and p1 in the laboratory, p2 in the sick bay (the lab's other door), p3 in the refectory. */
function ship(): GameState {
  const s = createGame(makeSeats(4), quiet, 3);
  for (const [id, room] of [["p0", "LABORATORY"], ["p1", "LABORATORY"], ["p2", "SICK_BAY"], ["p3", "REFECTORY"]] as const) player(s, id).room = room;
  for (const p of s.players) Object.assign(p, { ap: 10, mp: 10 });
  return s;
}

const moves = (s: GameState, id: string) => viewFor(s, id).actions.filter((o) => o.action.type === "move").map((o) => (o.action as { to: string }).to);

describe("the door model", () => {
  it("names a door the same from either side, and reads its rooms back", () => {
    expect(doorId("LABORATORY", "CORRIDOR_A")).toBe(LAB_DOOR);
    expect(doorRooms(LAB_DOOR)).toEqual(["CORRIDOR_A", "LABORATORY"]);
  });

  it("lists every door of the Daedalus once, none to a craft or the cheat room", () => {
    const config = resolveConfig({ cheatRoom: true });
    const doors = allDoors(config.rooms);
    expect(new Set(doors).size).toBe(doors.length);
    const s = createGame(makeSeats(3), { ...config, mushCount: 1 }, 7);
    for (const door of doors) expect(isDoor(s, door)).toBe(true);
    expect(doors.some((d) => d.includes(CHEAT_ROOM) || d.includes("CRAFT") || d.includes("PATROL_SHIP"))).toBe(false);
    // Each adjacency is one door: twice the door count is every exit of every Daedalus room.
    const exits = Object.entries(config.rooms).filter(([r]) => r !== CHEAT_ROOM && !r.includes("CRAFT") && !r.includes("PATROL_SHIP"));
    expect(doors.length * 2).toBe(exits.reduce((n, [, to]) => n + to.length, 0));
    expect(isDoor(s, "LABORATORY|CORRIDOR_A")).toBe(false);
    expect(isDoor(s, "LABORATORY|REFECTORY")).toBe(false);
  });

  it("starts every door working, breaks and repairs one, and keeps the map sparse", () => {
    const s = ship();
    expect(s.doors).toEqual({});
    expect(breakDoor(s, LAB_DOOR)).toBe(true);
    expect(breakDoor(s, LAB_DOOR)).toBe(false);
    expect(isDoorBroken(s, "LABORATORY", "CORRIDOR_A")).toBe(true);
    expect(isDoorBroken(s, "CORRIDOR_A", "LABORATORY")).toBe(true);
    expect(doorsOf(s, "LABORATORY")).toEqual([
      { id: LAB_DOOR, to: "CORRIDOR_A", broken: true },
      { id: doorId("LABORATORY", "SICK_BAY"), to: "SICK_BAY" },
    ]);
    expect(repairDoor(s, LAB_DOOR)).toBe(true);
    expect(repairDoor(s, LAB_DOOR)).toBe(false);
    expect(s.doors).toEqual({});
  });

  it("gives a game stored before doors every door working", () => {
    const s = ship();
    const raw: Partial<GameState> = clone(s);
    delete raw.doors;
    delete raw.config;
    expect(normalizeGame(raw, overridesOf(s.config)).doors).toEqual({});
  });
});

describe("a broken door blocks movement", () => {
  it("isn't offered or allowed from either side, and the refused move changes nothing", () => {
    const s = ship();
    breakDoor(s, LAB_DOOR);
    expect(moves(s, "p0")).toEqual(["SICK_BAY"]);
    const r = applyAction(s, "p0", { type: "move", to: "CORRIDOR_A" });
    expect(r.ok).toBe(false);
    player(s, "p3").room = "CORRIDOR_A";
    expect(moves(s, "p3")).not.toContain("LABORATORY");
    expect(applyAction(s, "p3", { type: "move", to: "LABORATORY" }).ok).toBe(false);
    // The other door still works.
    expect(player(mustApply(s, "p0", { type: "move", to: "SICK_BAY" }), "p0").room).toBe("SICK_BAY");
  });

  it("with a guardian in the room, leaves no way out to someone whose own door is broken", () => {
    const s = ship();
    player(s, "p1").enteredFrom = "CORRIDOR_A";
    const guarded = mustApply(s, "p0", { type: "guard" });
    expect(moves(guarded, "p1")).toEqual(["CORRIDOR_A"]);
    breakDoor(guarded, LAB_DOOR);
    expect(moves(guarded, "p1")).toEqual([]);
    // The guardian is held back only by the broken door.
    expect(moves(guarded, "p0")).toEqual(["SICK_BAY"]);
  });

  it("is routed around by shortestPath when told which doors are open", () => {
    const s = ship();
    breakDoor(s, LAB_DOOR);
    expect(shortestPath(s.config.rooms, "CORRIDOR_B", "LABORATORY")).toEqual(["CORRIDOR_A", "LABORATORY"]);
    expect(shortestPath(s.config.rooms, "CORRIDOR_B", "LABORATORY", (a, b) => !isDoorBroken(s, a, b))).toEqual(["CORRIDOR_A", "SICK_BAY", "LABORATORY"]);
    breakDoor(s, doorId("LABORATORY", "SICK_BAY"));
    expect(shortestPath(s.config.rooms, "CORRIDOR_B", "LABORATORY", (a, b) => !isDoorBroken(s, a, b))).toBeNull();
  });

  it("plans a player's walks (bots, tips) around only the broken doors their own view shows", () => {
    const s = ship();
    breakDoor(s, LAB_DOOR);
    // In the lab, p0 sees the broken door and goes round by the sick bay.
    expect(viewPath(viewFor(s, "p0"), "LABORATORY", "CORRIDOR_A")).toEqual(["SICK_BAY", "CORRIDOR_A"]);
    expect(doorCount(viewFor(s, "p0"), "CORRIDOR_A")).toBe(2);
    // In the refectory, p3 knows nothing of it: the walk still takes it.
    expect(viewPath(viewFor(s, "p3"), "REFECTORY", "LABORATORY")).toEqual(["CORRIDOR_B", "CORRIDOR_A", "LABORATORY"]);
    // Once reported, p3 routes around it too.
    const reported = mustApply(s, "p0", { type: "report_door", door: LAB_DOOR });
    expect(viewPath(viewFor(reported, "p3"), "REFECTORY", "LABORATORY")).toEqual(["CORRIDOR_B", "CORRIDOR_A", "SICK_BAY", "LABORATORY"]);
    // And with Defective piston sensors complete, view.brokenDoors informs everyone even without a report.
    const detected = clone(s);
    detected.projects.DOOR_SENSOR = PROJECT_COMPLETE;
    expect(viewPath(viewFor(detected, "p3"), "REFECTORY", "LABORATORY")).toEqual(["CORRIDOR_B", "CORRIDOR_A", "SICK_BAY", "LABORATORY"]);
  });
});

describe("the summons walk and broken doors", () => {
  /** p3 is walked from the refectory to the lab with the given doors broken. */
  const summoned = (...broken: string[]) => {
    const s = ship();
    for (const door of broken) breakDoor(s, door);
    const arrived = walk(s, "p3", "LABORATORY");
    return { s, arrived, keys: s.log.filter((e) => e.visibleTo !== "all" && e.visibleTo.includes("p3")).map((e) => e.key) };
  };

  it("finds a broken door on the way when it gets there, and walks around it", () => {
    const { s, arrived } = summoned(LAB_DOOR);
    expect(arrived).toBe(true);
    expect(player(s, "p3").room).toBe("LABORATORY");
    // Through the corridor where the door was found broken, then the sick bay.
    expect(s.log.filter((e) => e.key === "entered" && e.params?.name === player(s, "p3").character).map((e) => e.room)).toEqual(["CORRIDOR_B", "CORRIDOR_A", "SICK_BAY", "LABORATORY"]);
  });

  it("stops where it learns there is no way left", () => {
    const { s, arrived, keys } = summoned(LAB_DOOR, doorId("LABORATORY", "SICK_BAY"));
    expect(arrived).toBe(false);
    expect(player(s, "p3").room).toBe("SICK_BAY");
    expect(keys).toContain("summonStoppedNoPath");
  });
});

describe("Sensor drones and broken doors", () => {
  const addDrone = (s: GameState, room: string, upgrades: string[]): ItemState => {
    const item: ItemState = {
      id: `drone-${s.nextItemId++}`,
      type: SUPPORT_DRONE_ITEM,
      at: { kind: "room", id: room },
      drone: { name: "Robbie", serial: 42, upgrades, failures: { repair: 0, extinguish: 0, shoot: 0 } },
    };
    s.items.push(item);
    return item;
  };
  const roomOf = (s: GameState, id: string) => (s.items.find((i) => i.id === id)!.at as { id: string }).id;
  const calm = (): GameState => {
    const s = ship();
    for (const list of Object.values(s.equipment)) for (const e of list) delete e.broken;
    return s;
  };

  it("go around a broken door to their target", () => {
    const s = calm();
    startFire(s, "CORRIDOR_C");
    breakDoor(s, doorId("SPACESHIP_BAY_A", "CORRIDOR_C"));
    const drone = addDrone(s, "CORRIDOR_B", ["sensor", "firefighter"]);
    expect(roomOf(nextCycle(s), drone.id)).toBe("SPACESHIP_BAY_B");
  });

  it("never wander through one", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = calm();
      s.rng = createGame(makeSeats(4), quiet, seed).rng;
      breakDoor(s, doorId("CORRIDOR_B", "REFECTORY"));
      const drone = addDrone(s, "REFECTORY", []);
      expect(roomOf(nextCycle(s), drone.id)).toBe("REFECTORY");
    }
  });
});

describe("hidden information", () => {
  it("shows a door's state to the living on both sides of it and to no one else", () => {
    const s = ship();
    breakDoor(s, doorId("LABORATORY", "SICK_BAY"));
    expect(viewFor(s, "p0").doors).toEqual([
      { id: LAB_DOOR, to: "CORRIDOR_A" },
      { id: doorId("LABORATORY", "SICK_BAY"), to: "SICK_BAY", broken: true },
    ]);
    expect(viewFor(s, "p2").doors).toContainEqual({ id: doorId("LABORATORY", "SICK_BAY"), to: "LABORATORY", broken: true });
    const elsewhere = viewFor(s, "p3");
    expect(elsewhere.doors).toEqual([{ id: doorId("CORRIDOR_B", "REFECTORY"), to: "CORRIDOR_B" }]);
    expect(JSON.stringify(elsewhere)).not.toContain(doorId("LABORATORY", "SICK_BAY"));
    expect(JSON.stringify(elsewhere)).not.toContain('"broken":true');
  });

  it("shows the dead no doors", () => {
    const s = ship();
    breakDoor(s, LAB_DOOR);
    player(s, "p0").alive = false;
    expect(viewFor(s, "p0").doors).toEqual([]);
  });

  it("breaks silently: no log line", () => {
    const s = ship();
    const before = s.log.length;
    breakDoor(s, LAB_DOOR);
    expect(s.log.length).toBe(before);
  });
});

describe("the Superkube's Break a door", () => {
  const devShip = (): GameState => {
    const s = createGame(makeSeats(3), { ...resolveConfig({ cheatRoom: true }), mushCount: 1 }, 7);
    s.players.find((p) => p.role === "human")!.room = CHEAT_ROOM;
    return s;
  };

  it("breaks a working door, refusing a broken one or a made-up id", () => {
    const s = devShip();
    const by = s.players.find((p) => p.room === CHEAT_ROOM)!.id;
    const r = applyInput(s, { type: "kube", by, op: "breakDoor", arg: LAB_DOOR });
    if (!r.ok) throw new Error(r.error);
    expect(isDoorBroken(r.state, "LABORATORY", "CORRIDOR_A")).toBe(true);
    expect(applyInput(r.state, { type: "kube", by, op: "breakDoor", arg: LAB_DOOR })).toMatchObject({ ok: false, error: "door_broken" });
    expect(applyInput(s, { type: "kube", by, op: "breakDoor", arg: "LABORATORY|REFECTORY" })).toMatchObject({ ok: false, error: "bad_argument" });
  });
});

describe("repairing a door", () => {
  const LAB_SICK = doorId("LABORATORY", "SICK_BAY");

  it("pins the door repair chance at 0.25", () => {
    expect(DEFAULT_CONFIG.repair.chance.DOOR).toBe(0.25);
  });

  it("is offered on both sides of a broken door, scales with wrench, Technician and Genius, and is refused elsewhere or on a working door", () => {
    const s = ship();
    breakDoor(s, LAB_SICK);
    const base = s.config.repair.chance.DOOR!;
    expect(option(s, "p0", { type: "repair", door: LAB_SICK })).toMatchObject({ chance: base, cost: { ap: s.config.repair.cost.ap } });
    expect(option(s, "p2", { type: "repair", door: LAB_SICK })).toMatchObject({ chance: base, cost: { ap: s.config.repair.cost.ap } });
    expect(option(s, "p3", { type: "repair", door: LAB_SICK })).toBeUndefined();
    expect(option(s, "p0", { type: "repair", door: LAB_DOOR })).toBeUndefined();

    // Carrying a wrench multiplies by wrenchFactor; Technician multiplies by engineerFactor; Genius makes it certain.
    s.items.push({ id: "w1", type: WRENCH_ITEM, at: { kind: "player", id: "p0" } });
    expect(option(s, "p0", { type: "repair", door: LAB_SICK })?.chance).toBeCloseTo(base * s.config.repair.wrenchFactor);
    player(s, "p0").skills.push("engineer");
    expect(option(s, "p0", { type: "repair", door: LAB_SICK })?.chance).toBeCloseTo(
      Math.min(1, base * s.config.repair.wrenchFactor * s.config.repair.engineerFactor),
    );
    player(s, "p0").statuses.push("genius");
    expect(option(s, "p0", { type: "repair", door: LAB_SICK })?.chance).toBe(1);

    // Illegal targets leave state unchanged.
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", { type: "repair", door: LAB_DOOR })).toMatchObject({ ok: false, error: "illegal_action" });
    expect(applyAction(s, "p3", { type: "repair", door: LAB_SICK })).toMatchObject({ ok: false, error: "illegal_action" });
    expect(JSON.stringify(s)).toBe(before);
  });

  it("repairs the door publicly on success and logs privately on failure", () => {
    const sure = createGame(
      makeSeats(4),
      testConfig({ repair: { chance: { DOOR: 1 } } }),
      3,
    );
    player(sure, "p0").room = "LABORATORY";
    player(sure, "p1").room = "LABORATORY";
    player(sure, "p2").room = "SICK_BAY";
    for (const p of sure.players) Object.assign(p, { ap: 10, mp: 10 });
    breakDoor(sure, LAB_SICK);
    player(sure, "p0").statuses.push("genius");

    const fixed = mustApply(sure, "p0", { type: "repair", door: LAB_SICK });
    expect(isDoorBroken(fixed, "LABORATORY", "SICK_BAY")).toBe(false);
    expect(fixed.doors).toEqual({});
    expect(player(fixed, "p0").statuses).not.toContain("genius");
    expect(fixed.log.at(-1)).toMatchObject({
      key: "doorRepaired",
      room: "LABORATORY",
      visibleTo: "all",
      params: { name: player(sure, "p0").character, room: "SICK_BAY" },
    });
    expect(moves(fixed, "p0")).toContain("SICK_BAY");

    const never = createGame(
      makeSeats(4),
      testConfig({ repair: { chance: { DOOR: 0.0001 } } }),
      3,
    );
    player(never, "p0").room = "LABORATORY";
    player(never, "p1").room = "LABORATORY";
    for (const p of never.players) Object.assign(p, { ap: 10, mp: 10 });
    breakDoor(never, LAB_SICK);
    const failed = mustApply(never, "p0", { type: "repair", door: LAB_SICK });
    expect(isDoorBroken(failed, "LABORATORY", "SICK_BAY")).toBe(true);
    expect(failed.log.find((e) => e.key === "doorRepairFailed")).toMatchObject({
      visibleTo: ["p0"],
      params: { room: "SICK_BAY" },
    });
    expect(viewFor(failed, "p1").log.some((e) => e.key === "doorRepairFailed")).toBe(false);
  });

  it("targets the door for walk-up and ends accommodation", () => {
    const repair = { type: "repair", door: LAB_SICK } as const;
    expect(actionTarget(repair)).toEqual({ kind: "door", id: LAB_SICK });
    expect(endsAccommodation(repair, "p0", "public")).toBe(true);
  });
});

describe("Doorman (sabotage_door)", () => {
  const LAB_SICK = doorId("LABORATORY", "SICK_BAY");

  function mushShip(withSkill = true): GameState {
    const s = ship();
    player(s, "p0").role = "mush";
    player(s, "p0").mushSkills = withSkill ? ["doorman"] : [];
    player(s, "p1").role = "human";
    player(s, "p2").role = "human";
    player(s, "p3").role = "human";
    return s;
  }

  it("pins Doorman's repeat cost at 2 AP", () => {
    expect(DEFAULT_CONFIG.doorman.cost.ap).toBe(2);
  });

  it("lets a Mush with Doorman break a working door for free once a day, then for 2 AP, and resets the next day", () => {
    const s = mushShip();
    const first = { type: "sabotage_door", door: LAB_DOOR } as const;
    const second = { type: "sabotage_door", door: LAB_SICK } as const;

    expect(costOf(s, "p0", first).ap).toBe(0);
    const apBefore = player(s, "p0").ap;
    const once = mustApply(s, "p0", first);
    expect(player(once, "p0").ap).toBe(apBefore);
    expect(player(once, "p0").doormanToday).toBe(true);
    expect(isDoorBroken(once, "CORRIDOR_A", "LABORATORY")).toBe(true);
    expect(option(once, "p0", first)).toBeUndefined();

    // Second sabotage the same day costs config.doorman.cost.ap.
    expect(costOf(once, "p0", second).ap).toBe(once.config.doorman.cost.ap);
    const twice = mustApply(once, "p0", second);
    expect(player(twice, "p0").ap).toBe(apBefore - once.config.doorman.cost.ap);
    expect(isDoorBroken(twice, "LABORATORY", "SICK_BAY")).toBe(true);

    // Next day resets the free daily use.
    const next = nextDay(once);
    expect(player(next, "p0").doormanToday).toBeUndefined();
    expect(costOf(next, "p0", second).ap).toBe(0);
  });

  it("is only offered to a Mush with Doorman on working doors of their room, and illegal calls leave state unchanged", () => {
    const noSkill = mushShip(false);
    expect(offered(noSkill, "p0").some((a) => a.type === "sabotage_door")).toBe(false);
    expect(offered(noSkill, "p1").some((a) => a.type === "sabotage_door")).toBe(false);

    const s = mushShip();
    breakDoor(s, LAB_SICK);
    const offeredDoors = offered(s, "p0").filter((a) => a.type === "sabotage_door");
    expect(offeredDoors).toEqual([{ type: "sabotage_door", door: LAB_DOOR }]);

    // Not enough AP on repeat use.
    const once = mustApply(mushShip(), "p0", { type: "sabotage_door", door: LAB_DOOR });
    player(once, "p0").ap = once.config.doorman.cost.ap - 1;
    const beforeLowAp = JSON.stringify(once);
    expect(applyAction(once, "p0", { type: "sabotage_door", door: LAB_SICK }).ok).toBe(false);
    expect(JSON.stringify(once)).toBe(beforeLowAp);

    // Illegal targets (already broken, another room's door, non-Mush, missing skill) leave state unchanged.
    const otherDoor = doorId("CORRIDOR_B", "REFECTORY");
    const before = JSON.stringify(s);
    expect(applyAction(s, "p0", { type: "sabotage_door", door: LAB_SICK })).toMatchObject({ ok: false, error: "illegal_action" });
    expect(applyAction(s, "p0", { type: "sabotage_door", door: otherDoor })).toMatchObject({ ok: false, error: "illegal_action" });
    expect(applyAction(s, "p1", { type: "sabotage_door", door: LAB_DOOR })).toMatchObject({ ok: false, error: "illegal_action" });
    expect(applyAction(noSkill, "p0", { type: "sabotage_door", door: LAB_DOOR })).toMatchObject({ ok: false, error: "illegal_action" });
    expect(JSON.stringify(s)).toBe(before);
  });

  it("is covert: roommates do not see the log unless a camera is in the room, and doormanToday stays private", () => {
    const s = mushShip();
    const after = mustApply(s, "p0", { type: "sabotage_door", door: LAB_DOOR });
    const entry = after.log.find((e) => e.key === "doorSabotaged");
    expect(entry).toMatchObject({
      key: "doorSabotaged",
      kind: "covert",
      room: "LABORATORY",
      visibleTo: ["p0"],
      params: { name: player(s, "p0").character, room: "CORRIDOR_A" },
    });
    expect(viewFor(after, "p0").log.some((e) => e.key === "doorSabotaged")).toBe(true);
    expect(viewFor(after, "p1").log.some((e) => e.key === "doorSabotaged")).toBe(false);
    expect(viewFor(after, "p2").log.some((e) => e.key === "doorSabotaged")).toBe(false);
    expect(JSON.stringify(viewFor(after, "p1"))).not.toContain("doormanToday");
    expect(JSON.stringify(viewFor(after, "p0"))).toContain("doormanToday");

    // With a working camera in the room, roommates see it.
    const camShip = mushShip();
    camShip.equipment.LABORATORY.push({ id: "cam1", type: CAMERA_EQUIPMENT });
    const caught = mustApply(camShip, "p0", { type: "sabotage_door", door: LAB_DOOR });
    expect(caught.log.find((e) => e.key === "doorSabotaged")?.visibleTo).toBe("all");
    expect(viewFor(caught, "p1").log.some((e) => e.key === "doorSabotaged")).toBe(true);

    // Targets the door for walk-up and does not end accommodation (covert).
    const action = { type: "sabotage_door", door: LAB_DOOR } as const;
    expect(actionTarget(action)).toEqual({ kind: "door", id: LAB_DOOR });
    expect(endsAccommodation(action, "p0", "covert")).toBe(false);
  });
});
