import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { turned } from "../src/navigation.ts";
import { planetPicture } from "../src/planets.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, setCheat, viewFor } from "../src/rules.ts";
import type { Action, GameState, Planet } from "../src/types.ts";
import { makeSeats, must, nextCycle, offered, option, player } from "./support.ts";

const seats = makeSeats(3, "others");
const TERMINAL = "COMMAND_CENTER:PILOT_MODULE";
const turn = (side: "left" | "right"): Action => ({ type: "turn_ship", equipment: TERMINAL, side });
const travel: Action = { type: "travel", equipment: TERMINAL };
const leave: Action = { type: "leave_orbit", equipment: TERMINAL };
const { navigation } = DEFAULT_CONFIG;
/** The travel, then the cycle change that ends it. */
const arrived = (s: GameState): GameState => nextCycle(must(applyAction(s, "p0", travel)));

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
    expect(game().navigation).toEqual({ heading: "north", orbit: null, arriving: null, lastTurn: null });
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

  it("shows everyone aboard each turn and its side, but the heading only at the terminal", () => {
    const s = game();
    player(s, "p2").room = "LABORATORY";
    expect(viewFor(s, "p2").navigation.lastTurn).toBeNull();
    const once = must(applyAction(s, "p0", turn("left")));
    const twice = must(applyAction(once, "p0", turn("right")));
    expect(viewFor(once, "p2").navigation).toMatchObject({ heading: null, lastTurn: { n: 1, side: "left" } });
    expect(viewFor(twice, "p2").navigation.lastTurn).toEqual({ n: 2, side: "right" });
    expect(viewFor(twice, "p0").navigation).toMatchObject({ heading: "north", lastTurn: { n: 2, side: "right" } });
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
    const flying = must(applyAction(s, "p0", travel));
    expect(flying.navigation).toMatchObject({ orbit: null, arriving: { planet: "planet-a" } });
    expect(flying.log.at(-1)).toMatchObject({ key: "shipTraveled" });
    const next = nextCycle(flying);
    expect(next.ship.combustion).toBe(0);
    expect(next.ship.fuel).toBe(fuel);
    expect(next.navigation).toMatchObject({ orbit: "planet-a", arriving: null });
    expect(next.planets).toEqual({ p1: [s.planets.p1![0]], p2: [] });
    expect(next.log.map((e) => e.key)).toEqual(expect.arrayContaining(["shipInOrbit", "orbitingPlanet"]));
    expect(next.log.find((e) => e.key === "orbitingPlanet")).toMatchObject({ visibleTo: ["p1"], params: { planet: "Name-planet-a" } });
  });

  it("travelling where no planet lies loses them all", () => {
    const next = arrived(game(5));
    expect(next.navigation).toMatchObject({ orbit: null, arriving: null });
    expect(Object.values(next.planets).flat()).toEqual([]);
  });

  it("while traveling, until the next cycle change: no steering, scanning, patrol takeoff or deleting the planet ahead", () => {
    const s = must(applyAction(game(), "p0", travel));
    expect(offered(s, "p0").some((a) => ["turn_ship", "travel", "leave_orbit"].includes(a.type))).toBe(false);
    for (const action of [turn("left"), travel, leave]) expect(applyAction(s, "p0", action)).toMatchObject({ ok: false });
    expect(applyAction(s, "p1", { type: "scan_planet", equipment: "COMMAND_CENTER:ASTRO_MODULE" })).toMatchObject({ ok: false });
    expect(applyAction(s, "p1", { type: "delete_planet", equipment: "COMMAND_CENTER:ASTRO_MODULE", planet: "planet-a" })).toMatchObject({ ok: false });
    expect(viewFor(s, "p2").navigation).toMatchObject({ traveling: true, orbiting: false });
    expect(viewFor(nextCycle(s), "p2").navigation.traveling).toBe(false);
  });

  it("leaving orbit travels too, and arrives in empty space", () => {
    const s = arrived(game());
    s.ship.combustion = 4;
    const left = must(applyAction(s, "p0", leave));
    expect(left.navigation).toMatchObject({ orbit: null, arriving: { planet: null } });
    expect(nextCycle(left).navigation).toMatchObject({ orbit: null, arriving: null });
  });

  it("with nothing loaded, spends the AP and nothing else (tank fuel doesn't count)", () => {
    const s = game(0);
    const next = must(applyAction(s, "p0", travel));
    expect(next.ship.fuel).toBe(s.ship.fuel);
    expect(next.ship.combustion).toBe(0);
    expect(next.planets).toEqual(s.planets);
    expect(next.navigation).toMatchObject({ orbit: null, arriving: null });
    expect(player(next, "p0").ap).toBe(player(s, "p0").ap - navigation.travel.cost.ap);
    expect(next.log.at(-1)).toMatchObject({ key: "travelNoFuel", room: "COMMAND_CENTER" });
  });

  it("in orbit: no travel or scan, the orbited planet can't be deleted, and leaving orbit loses it", () => {
    const s = arrived(game());
    expect(offered(s, "p0").some((a) => a.type === "travel")).toBe(false);
    expect(applyAction(s, "p0", travel)).toMatchObject({ ok: false });
    expect(option(game(), "p1", { type: "scan_planet" })).toBeDefined();
    expect(option(s, "p1", { type: "scan_planet" })).toBeUndefined();
    expect(applyAction(s, "p1", { type: "delete_planet", equipment: "COMMAND_CENTER:ASTRO_MODULE", planet: "planet-a" })).toMatchObject({ ok: false });
    expect(option(s, "p1", { type: "delete_planet" })).toBeUndefined();
    expect(must(applyAction(s, "p0", turn("left"))).navigation.heading).toBe("west");
    s.ship.combustion = 4;
    const left = must(applyAction(s, "p0", leave));
    expect(left.navigation).toMatchObject({ orbit: null, arriving: { planet: null } });
    expect(left.ship.combustion).toBe(4 - navigation.leaveOrbit.fuel);
    expect(left.planets.p1).toEqual([]);
    expect(left.log.at(-1)).toMatchObject({ key: "leftOrbit", visibleTo: "all" });
    expect(left.log.at(-1)!.room).toBeUndefined();
    expect(applyAction(left, "p0", leave)).toMatchObject({ ok: false });
  });

  it("leaving orbit short of fuel spends the AP and stays", () => {
    const s = arrived(game());
    s.ship.combustion = 0;
    const next = must(applyAction(s, "p0", leave));
    expect(next.navigation.orbit).toBe("planet-a");
    expect(next.log.at(-1)).toMatchObject({ key: "leaveOrbitNoFuel" });
  });

  it("with the easy travel cheat, leaving orbit costs no fuel, even with none loaded", () => {
    const s = must(setCheat(arrived(game()), "p0", "easyTravel", true));
    s.ship.combustion = 0;
    const left = must(applyAction(s, "p0", leave));
    expect(left.navigation).toMatchObject({ orbit: null, arriving: { planet: null } });
    expect(left.ship.combustion).toBe(0);
  });

  it("views: everyone knows the ship is in orbit and the planet's name, only the finder its sectors, the heading only at the terminal", () => {
    const s = arrived(game());
    player(s, "p2").room = "CORRIDOR_A";
    const finder = viewFor(s, "p1");
    const picture = planetPicture({ name: "Name-planet-a" });
    expect(finder.navigation).toEqual({ orbiting: true, traveling: false, orbitPicture: picture, orbitName: "Name-planet-a", heading: "north", lastTurn: null });
    expect(finder.planets).toMatchObject([{ id: "planet-a", orbited: true }]);
    // The name is public once in orbit (owner, 2026-10-31); the planet's id, sectors and finder are not.
    const other = viewFor(s, "p2");
    expect(other.navigation).toEqual({ orbiting: true, traveling: false, orbitPicture: picture, orbitName: "Name-planet-a", heading: null, lastTurn: null });
    expect(other.planets).toEqual([]);
    expect(JSON.stringify(other)).not.toContain('"planet-a"');
    expect(viewFor(game(), "p1").planets[0]!.orbited).toBeUndefined();
    expect(viewFor(game(), "p1").navigation.orbitPicture).toBeNull();
  });

  it("keeps the destination's name private while the ship travels, and drops it on leaving orbit", () => {
    const traveling = must(applyAction(game(), "p0", travel));
    expect(viewFor(traveling, "p0").navigation.orbitName).toBeNull();
    expect(JSON.stringify(viewFor(traveling, "p0"))).not.toContain("Name-planet-a");
    const orbiting = arrived(game());
    orbiting.ship.combustion = navigation.leaveOrbit.fuel;
    const left = must(applyAction(orbiting, "p0", leave));
    expect(viewFor(left, "p0").navigation.orbitName).toBeNull();
    expect(viewFor(nextCycle(left), "p2").navigation.orbitName).toBeNull();
  });

  it("parses the actions from the client and drops malformed ones", () => {
    for (const action of [turn("left"), travel, leave]) expect(parseGameMessage(JSON.stringify({ type: "action", action }))).toEqual({ type: "action", action });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "turn_ship", equipment: TERMINAL, side: "up" } }))).toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "travel" } }))).toBeNull();
  });
});

describe("easy travel cheat", () => {
  const ASTRO = "COMMAND_CENTER:ASTRO_MODULE";
  const warp = (planet: string): Action => ({ type: "warp_to_planet", equipment: ASTRO, planet });
  /** p0 (the only human) with the cheat on and a planet of their own south at 2; p1 and p2 keep theirs. */
  const cheating = (loaded = 3) => {
    const s = must(setCheat(game(loaded), "p0", "easyTravel", true));
    s.planets.p0 = [planet("planet-c", "south", 2)];
    return s;
  };

  it("is only offered with the cheat on, to humans, at the Astro terminal, for your own planets, out of orbit", () => {
    const off = game();
    off.planets.p0 = [planet("planet-c", "south", 2)];
    expect(offered(off, "p0").some((a) => a.type === "warp_to_planet")).toBe(false);
    const s = cheating();
    expect(offered(s, "p0").filter((a) => a.type === "warp_to_planet")).toEqual([warp("planet-c")]);
    expect(applyAction(s, "p0", warp("planet-a"))).toMatchObject({ ok: false });
    const bot = must(setCheat(s, "p1", "easyTravel", true));
    expect(offered(bot, "p1").some((a) => a.type === "warp_to_planet")).toBe(false);
    player(s, "p0").room = "CORRIDOR_A";
    expect(offered(s, "p0").some((a) => a.type === "warp_to_planet")).toBe(false);
  });

  it("turns the ship to the planet and puts it in orbit at once, free and without fuel, as a travel would", () => {
    const s = cheating(0);
    const before = player(s, "p0").ap;
    const next = must(applyAction(s, "p0", warp("planet-c")));
    expect(next.navigation).toEqual({ heading: "south", orbit: "planet-c", arriving: null, lastTurn: null });
    expect(next.ship.combustion).toBe(0);
    expect(player(next, "p0").ap).toBe(before);
    expect(next.planets).toMatchObject({ p0: [{ id: "planet-c" }], p1: [], p2: [] });
    expect(viewFor(next, "p2").navigation).toMatchObject({ orbiting: true, traveling: false, orbitPicture: planetPicture({ name: "Name-planet-c" }) });
    expect(next.log.at(-1)).toMatchObject({ key: "orbitingPlanet", visibleTo: ["p0"] });
    expect(offered(next, "p0").some((a) => a.type === "warp_to_planet")).toBe(false);
  });
});
