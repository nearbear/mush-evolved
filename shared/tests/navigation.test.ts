import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { turned } from "../src/navigation.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import type { Action, GameState, Planet } from "../src/types.ts";
import { makeSeats, must, offered, option, player } from "./support.ts";

const seats = makeSeats(3, "others");
const TERMINAL = "COMMAND_CENTER:PILOT_MODULE";
const turn = (side: "left" | "right"): Action => ({ type: "turn_ship", equipment: TERMINAL, side });
const travel: Action = { type: "travel", equipment: TERMINAL };
const leave: Action = { type: "leave_orbit", equipment: TERMINAL };
const { navigation } = DEFAULT_CONFIG;

const planet = (id: string, direction: Planet["direction"], distance: number): Planet => ({
  id,
  name: `Name-${id}`,
  direction,
  distance,
  sectors: [{ tag: "FOREST", known: true }],
});

/** Everyone on the bridge, p0 the Commander, `loaded` fuel in the combustion chamber; p1 found a planet north at 3, p2 one east at 5. */
function game(loaded = 3): GameState {
  const s = createGame(seats, structuredClone(DEFAULT_CONFIG), 7);
  for (const p of s.players) p.room = "COMMAND_CENTER";
  s.titles.commander = "p0";
  s.ship.combustion = loaded;
  s.planets.p1 = [planet("planet-a", "north", 3)];
  s.planets.p2 = [planet("planet-b", "east", 5)];
  return s;
}

describe("ship navigation", () => {
  it("pins the decided numbers: 1 AP to turn, travel or leave orbit; 1 fuel to leave; facing north at the start", () => {
    expect([navigation.turn.cost.ap, navigation.travel.cost.ap, navigation.leaveOrbit.cost.ap, navigation.leaveOrbit.fuel]).toEqual([1, 1, 1, 1]);
    expect(game().navigation).toEqual({ heading: "north", orbit: null });
  });

  it("turns a quarter at a time, left anticlockwise", () => {
    expect(turned("north", "left")).toBe("west");
    expect(turned("west", "left")).toBe("south");
    expect(turned("north", "right")).toBe("east");
    expect(turned("east", "right")).toBe("south");
    const s = must(applyAction(game(), "p0", turn("right")));
    expect(s.navigation.heading).toBe("east");
    expect(player(s, "p0").ap).toBe(game().players[0]!.ap - navigation.turn.cost.ap);
    expect(s.log.at(-1)).toMatchObject({ key: "turnedShip", room: "COMMAND_CENTER", visibleTo: "all", params: { direction: "east" } });
  });

  it("is the Commander's alone, at the Command terminal", () => {
    const s = game();
    expect(offered(s, "p1").some((a) => a.type === "turn_ship" || a.type === "travel")).toBe(false);
    expect(applyAction(s, "p1", turn("left"))).toMatchObject({ ok: false });
    expect(applyAction(s, "p1", travel)).toMatchObject({ ok: false });
    expect(offered(s, "p0").filter((a) => a.type === "travel")).toEqual([travel]);
    s.titles.commander = "p1";
    expect(must(applyAction(s, "p1", turn("left"))).navigation.heading).toBe("west");
    const away = game();
    player(away, "p0").room = "CORRIDOR_A";
    expect(applyAction(away, "p0", travel)).toMatchObject({ ok: false });
  });

  it("enters orbit at a known planet, burns all the loaded fuel as the distance, and loses every other planet", () => {
    const s = game();
    const fuel = s.ship.fuel;
    const next = must(applyAction(s, "p0", travel));
    expect(next.ship.combustion).toBe(0);
    expect(next.ship.fuel).toBe(fuel);
    expect(next.navigation.orbit).toBe("planet-a");
    expect(next.planets).toEqual({ p1: [s.planets.p1![0]], p2: [] });
    expect(next.log.slice(-3).map((e) => e.key)).toEqual(["shipTraveled", "shipInOrbit", "orbitingPlanet"]);
    expect(next.log.at(-1)).toMatchObject({ visibleTo: ["p1"], params: { planet: "Name-planet-a" } });
  });

  it("travelling where no planet lies loses them all", () => {
    const next = must(applyAction(game(5), "p0", travel));
    expect(next.navigation.orbit).toBeNull();
    expect(Object.values(next.planets).flat()).toEqual([]);
  });

  it("with nothing loaded, spends the AP and nothing else (tank fuel doesn't count)", () => {
    const s = game(0);
    const next = must(applyAction(s, "p0", travel));
    expect(next.ship.fuel).toBe(s.ship.fuel);
    expect(next.ship.combustion).toBe(0);
    expect(next.planets).toEqual(s.planets);
    expect(next.navigation.orbit).toBeNull();
    expect(player(next, "p0").ap).toBe(player(s, "p0").ap - navigation.travel.cost.ap);
    expect(next.log.at(-1)).toMatchObject({ key: "travelNoFuel", room: "COMMAND_CENTER" });
  });

  it("in orbit: no travel or scan, the orbited planet can't be deleted, and leaving orbit loses it", () => {
    const s = must(applyAction(game(), "p0", travel));
    expect(offered(s, "p0").some((a) => a.type === "travel")).toBe(false);
    expect(applyAction(s, "p0", travel)).toMatchObject({ ok: false });
    expect(option(game(), "p1", { type: "scan_planet" })).toBeDefined();
    expect(option(s, "p1", { type: "scan_planet" })).toBeUndefined();
    expect(applyAction(s, "p1", { type: "delete_planet", equipment: "COMMAND_CENTER:ASTRO_MODULE", planet: "planet-a" })).toMatchObject({ ok: false });
    expect(option(s, "p1", { type: "delete_planet" })).toBeUndefined();
    expect(must(applyAction(s, "p0", turn("left"))).navigation.heading).toBe("west");
    s.ship.combustion = 4;
    const left = must(applyAction(s, "p0", leave));
    expect(left.navigation.orbit).toBeNull();
    expect(left.ship.combustion).toBe(4 - navigation.leaveOrbit.fuel);
    expect(left.planets.p1).toEqual([]);
    expect(left.log.at(-1)).toMatchObject({ key: "leftOrbit", visibleTo: "all" });
    expect(left.log.at(-1)!.room).toBeUndefined();
    expect(applyAction(left, "p0", leave)).toMatchObject({ ok: false });
  });

  it("leaving orbit short of fuel spends the AP and stays", () => {
    const s = must(applyAction(game(), "p0", travel));
    s.ship.combustion = 0;
    const next = must(applyAction(s, "p0", leave));
    expect(next.navigation.orbit).toBe("planet-a");
    expect(next.log.at(-1)).toMatchObject({ key: "leaveOrbitNoFuel" });
  });

  it("views: everyone knows the ship is in orbit, only the finder which planet, the heading only at the terminal", () => {
    const s = must(applyAction(game(), "p0", travel));
    player(s, "p2").room = "CORRIDOR_A";
    const finder = viewFor(s, "p1");
    expect(finder.navigation).toEqual({ orbiting: true, heading: "north" });
    expect(finder.planets).toMatchObject([{ id: "planet-a", orbited: true }]);
    const other = viewFor(s, "p2");
    expect(other.navigation).toEqual({ orbiting: true, heading: null });
    expect(JSON.stringify(other)).not.toContain("planet-a");
    expect(JSON.stringify(other)).not.toContain("Name-planet-a");
    expect(JSON.stringify(viewFor(s, "p0"))).not.toContain("Name-planet-a");
    expect(viewFor(game(), "p1").planets[0]!.orbited).toBeUndefined();
  });

  it("parses the actions from the client and drops malformed ones", () => {
    for (const action of [turn("left"), travel, leave]) expect(parseGameMessage(JSON.stringify({ type: "action", action }))).toEqual({ type: "action", action });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "turn_ship", equipment: TERMINAL, side: "up" } }))).toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "travel" } }))).toBeNull();
  });
});
