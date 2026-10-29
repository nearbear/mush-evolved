import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { FUEL_CAPSULE_ITEM, capacity, itemsIn } from "../src/items.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState } from "../src/types.ts";
import { makeSeats, must, mustApply, offered, player } from "./support.ts";

const TANK = "STORAGE_A_1:FUEL_TANK";
const CHAMBER = "MOTOR_ROOM:COMBUSTION_CHAMBER_ACCESS";
const take: Action = { type: "take_fuel", equipment: TANK };
const load: Action = { type: "load_fuel", equipment: CHAMBER };
const unload: Action = { type: "unload_fuel", equipment: CHAMBER };
const check: Action = { type: "check_combustion", equipment: CHAMBER };
const { ship, fuel } = DEFAULT_CONFIG;

function game(room: string): GameState {
  const s = createGame(makeSeats(3), structuredClone(DEFAULT_CONFIG), 3);
  for (const p of s.players) p.room = room;
  return s;
}
/** Whether a log line with this key was written (a dirt roll may add one after it). */
const logged = (s: GameState, key: string) => s.log.some((e) => e.key === key);
const capsules = (s: GameState, id = "p0") => itemsIn(s, { kind: "player", id }).filter((i) => i.type === FUEL_CAPSULE_ITEM).length;

describe("fuel loading", () => {
  it("pins the decided numbers: the chamber starts empty and holds 9; 20 fuel in the tanks; 0 AP, 15% dirt", () => {
    expect([ship.combustion.start, ship.combustion.max, ship.fuel.start, fuel.cost.ap, fuel.dirtyChance]).toEqual([0, 9, 20, 0, 0.15]);
  });

  it("takes a capsule from a tank, one fuel at a time, only in a storage with a tank", () => {
    const s = game("STORAGE_B_1");
    expect(offered(s, "p0")).toContainEqual({ type: "take_fuel", equipment: "STORAGE_B_1:FUEL_TANK" });
    const next = must(applyAction(s, "p0", { type: "take_fuel", equipment: "STORAGE_B_1:FUEL_TANK" }));
    expect([next.ship.fuel, capsules(next)]).toEqual([s.ship.fuel - 1, 1]);
    expect(next.log.find((e) => e.key === "tookFuel")).toMatchObject({ room: "STORAGE_B_1" });
    expect(applyAction(s, "p0", take)).toMatchObject({ ok: false });
    const elsewhere = game("MOTOR_ROOM");
    expect(offered(elsewhere, "p0").some((a) => a.type === "take_fuel")).toBe(false);
    expect(applyAction(elsewhere, "p0", take)).toMatchObject({ ok: false });
  });

  it("an empty tank gives nothing", () => {
    const s = game("STORAGE_A_1");
    s.ship.fuel = 0;
    expect(applyAction(s, "p0", take)).toMatchObject({ ok: false });
    expect(offered(s, "p0").some((a) => a.type === "take_fuel")).toBe(false);
  });

  it("each capsule takes a slot, and they can't be dropped", () => {
    let s = game("STORAGE_A_1");
    const mine = { kind: "player", id: "p0" } as const;
    const free = capacity(s, mine) - itemsIn(s, mine).length;
    for (let i = 0; i < free; i++) s = must(applyAction(s, "p0", take));
    expect(capsules(s)).toBe(free);
    expect(applyAction(s, "p0", take)).toMatchObject({ ok: false });
    const capsule = itemsIn(s, { kind: "player", id: "p0" }).find((i) => i.type === FUEL_CAPSULE_ITEM)!;
    expect(applyAction(s, "p0", { type: "drop", item: capsule.id })).toMatchObject({ ok: false });
  });

  it("full hands: taking or unloading a capsule is refused and shown disabled", () => {
    const mine = { kind: "player", id: "p0" } as const;
    const fill = (s: GameState) => {
      while (itemsIn(s, mine).length < capacity(s, mine)) s.items.push({ id: `filler-${s.nextItemId++}`, type: "wrench", at: mine });
    };
    const disabled = (s: GameState, action: Action) => viewFor(s, "p0").actions.find((o) => JSON.stringify(o.action) === JSON.stringify(action));
    let s = game("STORAGE_A_1");
    fill(s);
    expect(applyAction(s, "p0", take)).toMatchObject({ ok: false });
    expect(offered(s, "p0")).not.toContainEqual(take);
    expect(disabled(s, take)?.lacks).toEqual(["space"]);
    expect(s.ship.fuel).toBe(ship.fuel.start);
    const atChamber = game("MOTOR_ROOM");
    atChamber.ship.combustion = 2;
    fill(atChamber);
    expect(applyAction(atChamber, "p0", unload)).toMatchObject({ ok: false });
    expect(disabled(atChamber, unload)?.lacks).toEqual(["space"]);
    // A capsule already in hand doesn't make room for another.
    s = game("STORAGE_A_1");
    s = must(applyAction(s, "p0", take));
    fill(s);
    expect(disabled(s, take)?.lacks).toEqual(["space"]);
  });

  it("puts a carried capsule back into a tank, giving the fuel back", () => {
    let s = game("STORAGE_A_1");
    const back: Action = { type: "return_fuel", equipment: TANK };
    expect(offered(s, "p0")).not.toContainEqual(back);
    s = mustApply(s, "p0", take, take);
    expect(offered(s, "p0")).toContainEqual(back);
    s = must(applyAction(s, "p0", back));
    expect([s.ship.fuel, capsules(s), logged(s, "returnedFuel")]).toEqual([ship.fuel.start - 1, 1, true]);
    s.ship.fuel = ship.fuel.max;
    expect(applyAction(s, "p0", back)).toMatchObject({ ok: false });
    const chamberRoom = game("MOTOR_ROOM");
    expect(applyAction(chamberRoom, "p0", back)).toMatchObject({ ok: false });
  });

  it("a capsule stuck by a full chamber can go back to a tank", () => {
    let s = game("STORAGE_A_1");
    s = must(applyAction(s, "p0", take));
    s.ship.combustion = ship.combustion.max;
    player(s, "p0").room = "MOTOR_ROOM";
    expect(applyAction(s, "p0", load)).toMatchObject({ ok: false });
    player(s, "p0").room = "STORAGE_A_1";
    expect(offered(s, "p0")).toContainEqual({ type: "return_fuel", equipment: TANK });
  });

  it("taking, loading and unloading all use the fuel injury chance", () => {
    for (const [room, action] of [["STORAGE_A_1", take], ["MOTOR_ROOM", unload]] as const) {
      const s = game(room);
      s.config.fuel.injuryChance = 1;
      s.ship.combustion = 1;
      const after = must(applyAction(s, "p0", action));
      expect(logged(after, "randomInjury")).toBe(true);
    }
  });

  it("loads carried capsules into the chamber, up to its cap, and unloads them again", () => {
    let s = game("STORAGE_A_1");
    s = mustApply(s, "p0", take, take);
    player(s, "p0").room = "MOTOR_ROOM";
    expect(offered(s, "p0")).toContainEqual(load);
    s = must(applyAction(s, "p0", load));
    expect([s.ship.combustion, capsules(s), logged(s, "loadedFuel")]).toEqual([1, 1, true]);
    s = must(applyAction(s, "p0", unload));
    expect([s.ship.combustion, capsules(s), logged(s, "unloadedFuel")]).toEqual([0, 2, true]);
    expect(applyAction(s, "p0", unload)).toMatchObject({ ok: false });
    s.ship.combustion = ship.combustion.max;
    expect(applyAction(s, "p0", load)).toMatchObject({ ok: false });
  });

  it("loading needs a capsule in hand and the chamber's room", () => {
    const s = game("MOTOR_ROOM");
    expect(applyAction(s, "p0", load)).toMatchObject({ ok: false });
    expect(offered(s, "p0").some((a) => a.type === "load_fuel")).toBe(false);
    expect(offered(s, "p0")).not.toContainEqual(unload);
    const carried = game("STORAGE_A_1");
    const withCapsule = mustApply(carried, "p0", take);
    expect(applyAction(withCapsule, "p0", load)).toMatchObject({ ok: false });
  });

  it("the ship can't travel on tank fuel; it burns the chamber's load as the distance", () => {
    let s = game("STORAGE_A_1");
    for (let trip = 0; trip < 3; trip++) {
      player(s, "p0").room = "STORAGE_A_1";
      s = must(applyAction(s, "p0", take));
      player(s, "p0").room = "MOTOR_ROOM";
      s = must(applyAction(s, "p0", load));
    }
    expect(s.ship.combustion).toBe(3);
    player(s, "p0").room = "COMMAND_CENTER";
    s.titles.commander = "p0";
    s.planets.p1 = [{ id: "planet-a", name: "A", direction: "north", distance: 3, sectors: [{ tag: "FOREST", known: true }] }];
    s = must(applyAction(s, "p0", { type: "travel", equipment: "COMMAND_CENTER:PILOT_MODULE" }));
    expect([s.ship.combustion, s.ship.fuel, s.navigation.orbit]).toEqual([0, DEFAULT_CONFIG.ship.fuel.start - 3, "planet-a"]);
  });

  it("taking, loading and unloading are secret: a bystander sees them, an empty room doesn't", () => {
    let s = game("STORAGE_A_1");
    for (const id of ["p1", "p2"]) player(s, id).room = "CORRIDOR_A";
    s = must(applyAction(s, "p0", take));
    expect(s.log.find((e) => e.key === "tookFuel")?.visibleTo).toEqual(["p0"]);
    player(s, "p0").room = "MOTOR_ROOM";
    player(s, "p1").room = "MOTOR_ROOM";
    s = must(applyAction(s, "p0", load));
    expect(s.log.find((e) => e.key === "loadedFuel")?.visibleTo).toBe("all");
  });

  it("loading and unloading log the chamber's level", () => {
    let s = game("STORAGE_A_1");
    s = mustApply(s, "p0", take, take);
    player(s, "p0").room = "MOTOR_ROOM";
    s = mustApply(s, "p0", load, load, unload);
    const params = (key: string) => s.log.filter((e) => e.key === key).map((e) => e.params);
    expect(params("loadedFuel")).toEqual([
      { name: "Chun", level: 1, max: ship.combustion.max },
      { name: "Chun", level: 2, max: ship.combustion.max },
    ].map((p) => expect.objectContaining({ level: p.level, max: p.max })));
    expect(params("unloadedFuel")).toEqual([expect.objectContaining({ level: 1, max: ship.combustion.max })]);
  });

  it("checking the chamber is free, only offered in its room, and tells only you the level", () => {
    let s = game("CORRIDOR_A");
    expect(offered(s, "p0").some((a) => a.type === "check_combustion")).toBe(false);
    expect(applyAction(s, "p0", check)).toMatchObject({ ok: false });
    s = game("MOTOR_ROOM");
    s.ship.combustion = 5;
    player(s, "p1").room = "MOTOR_ROOM";
    expect(offered(s, "p0")).toContainEqual(check);
    const ap = player(s, "p0").ap;
    s = must(applyAction(s, "p0", check));
    expect(player(s, "p0").ap).toBe(ap);
    const entry = s.log.find((e) => e.key === "checkedCombustion");
    expect([entry?.visibleTo, entry?.params]).toEqual([["p0"], { level: 5, max: ship.combustion.max }]);
    expect(viewFor(s, "p1").log.some((e) => e.key === "checkedCombustion")).toBe(false);
  });

  it("the chamber level is not in the public ship view", () => {
    const s = game("CORRIDOR_A");
    s.ship.combustion = 4;
    const ship = viewFor(s, "p1").ship;
    expect(ship).not.toHaveProperty("combustion");
    expect(ship.max).not.toHaveProperty("combustion");
  });

  it("parses the actions from the client", () => {
    for (const action of [take, load, unload, check, { type: "return_fuel", equipment: TANK } as Action]) expect(parseGameMessage(JSON.stringify({ type: "action", action }))).toEqual({ type: "action", action });
  });
});
