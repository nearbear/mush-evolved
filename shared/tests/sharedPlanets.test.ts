import { describe, expect, it } from "vitest";
import { sendChat } from "../src/chat.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { dayOf } from "../src/helpers.ts";
import { ITRACKIE_ITEM } from "../src/items.ts";
import { moderateChat } from "../src/moderation.ts";
import { normalizeSharedPlanet } from "../src/normalizeState.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyInput } from "../src/replay.ts";
import { applyAction, createGame, viewFor, type ActionResult } from "../src/rules.ts";
import { MAX_SHARED_PLANET_LENGTH, MAX_SHARED_PLANET_LINES, sharePlanet } from "../src/sharedPlanets.ts";
import type { Action, GameState, Planet } from "../src/types.ts";
import { clone, makeSeats, must, nextCycle, player } from "./support.ts";

const seats = makeSeats(4, "others");
const COMMAND = "COMMAND_CENTER:PILOT_MODULE";
const ASTRO = "COMMAND_CENTER:ASTRO_MODULE";
const travel: Action = { type: "travel", equipment: COMMAND };
const leave: Action = { type: "leave_orbit", equipment: COMMAND };

const error = (r: ActionResult): string => {
  if (r.ok) throw new Error("expected a failure");
  return r.error;
};

const planet = (id: string, direction: Planet["direction"], distance: number): Planet => ({
  id,
  name: `Name-${id}`,
  direction,
  distance,
  sectors: [{ tag: "FOREST", known: true }],
});

/** Everyone on the bridge, by the Astro terminal; p0 the Commander with 3 fuel loaded (facing north); p1 found a planet north at 3, p2 two others. */
function game(): GameState {
  const s = createGame(seats, structuredClone(DEFAULT_CONFIG), 7);
  for (const p of s.players) p.room = "COMMAND_CENTER";
  s.titles.commander = "p0";
  s.ship.combustion = 3;
  s.planets.p1 = [planet("planet-a", "north", 3)];
  s.planets.p2 = [planet("planet-b", "east", 5), planet("planet-c", "west", 2)];
  return s;
}

/** One unknown slot: every test planet has one sector. */
const SLOTS = [null];

/** p1 shares planet-a, then p2 planet-b. */
const shared = (): GameState => must(sharePlanet(must(sharePlanet(game(), "p1", "planet-a", ["FOREST"], "North, 3: forest")), "p2", "planet-b", [null], "East, 5"));

describe("sharing planets", () => {
  it("pins the decided limit: 500 characters", () => {
    expect(MAX_SHARED_PLANET_LENGTH).toBe(500);
  });

  it("adds one entry per planet, for everyone who reads the Astrophysics feature, with a line in its chat", () => {
    const s = shared();
    const day = dayOf(s);
    expect(s.sharedPlanets).toEqual([
      { id: "sp-1", planet: "planet-a", name: "Name-planet-a", sectors: ["FOREST"], text: "North, 3: forest", by: "p1", ...day, stale: false },
      { id: "sp-2", planet: "planet-b", name: "Name-planet-b", sectors: [null], text: "East, 5", by: "p2", ...day, stale: false },
    ]);
    const view = viewFor(s, "p3");
    expect(view.sharedPlanets).toEqual([
      { id: "sp-1", name: "Name-planet-a", sectors: ["FOREST"], text: "North, 3: forest", by: "p1", ...day, stale: false },
      { id: "sp-2", name: "Name-planet-b", sectors: [null], text: "East, 5", by: "p2", ...day, stale: false },
    ]);
    // Which planet an entry came from never goes out, not even to its finder (the name is the planet's own, not its id).
    for (const id of ["p0", "p1", "p2", "p3"]) expect(JSON.stringify(viewFor(s, id).sharedPlanets)).not.toMatch(/"planet-|:"planet-/);
    expect(s.chat.filter((m) => m.channel === "astrophysics").map((m) => m.system)).toEqual([
      { key: "planetShared", params: { name: player(s, "p1").character } },
      { key: "planetShared", params: { name: player(s, "p2").character } },
    ]);
  });

  it("is free and takes the text as written, trimmed", () => {
    const before = game();
    const s = must(sharePlanet(before, "p1", "planet-a", SLOTS, "  Lies, all lies \n line two  "));
    expect(s.sharedPlanets[0]!.text).toBe("Lies, all lies \n line two");
    expect(player(s, "p1").ap).toBe(player(before, "p1").ap);
    expect(player(s, "p1").mp).toBe(player(before, "p1").mp);
  });

  it("each entry is a thread with the feature's access: the living with an iTrackie post, the dead only read", () => {
    let s = must(sendChat(shared(), "p3", "sp-1", "Worth a look"));
    expect(viewFor(s, "p0").chat.some((m) => m.channel === "sp-1" && m.text === "Worth a look")).toBe(true);
    expect(viewFor(s, "p0").chatChannels).toContain("sp-2");
    const dead = clone(s);
    player(dead, "p3").alive = false;
    expect(viewFor(dead, "p3").sharedPlanets).toHaveLength(2);
    expect(viewFor(dead, "p3").readChannels).toContain("sp-1");
    expect(sendChat(dead, "p3", "sp-1", "boo").ok).toBe(false);
    // No iTrackie: no entries, no threads.
    const mine = viewFor(s, "p0").inventory.find((i) => i.type === ITRACKIE_ITEM)!.id;
    s = must(applyAction(s, "p0", { type: "drop", item: mine }));
    expect(viewFor(s, "p0").sharedPlanets).toEqual([]);
    expect(JSON.stringify(viewFor(s, "p0"))).not.toContain("Worth a look");
    expect(sendChat(s, "p0", "sp-1", "hi").ok).toBe(false);
  });

  it("sharing again replaces the text and keeps the entry and its thread, even one no longer applicable", () => {
    let s = must(sendChat(shared(), "p3", "sp-1", "Nice"));
    s.sharedPlanets[0]!.stale = true;
    s = nextCycle(s);
    s = must(sharePlanet(s, "p1", "planet-a", ["RUINS"], "Actually ruins"));
    expect(s.sharedPlanets).toHaveLength(2);
    expect(s.sharedPlanets[0]).toMatchObject({ id: "sp-1", sectors: ["RUINS"], text: "Actually ruins", stale: false, ...dayOf(s) });
    expect(s.chat.some((m) => m.channel === "sp-1" && m.text === "Nice")).toBe(true);
    expect(s.chat.at(-1)!.system).toEqual({ key: "planetShareUpdated", params: { name: player(s, "p1").character } });
  });

  it("needs a living player with an iTrackie at an Astro terminal, their own planet, and a text of up to 500 characters", () => {
    const s = game();
    expect(error(sharePlanet(s, "p2", "planet-a", SLOTS, "mine now"))).toBe("planet_not_found");
    expect(error(sharePlanet(s, "p1", "planet-zz", SLOTS, "x"))).toBe("planet_not_found");
    expect(error(sharePlanet(s, "p1", "planet-a", SLOTS, "   "))).toBe("share_text_invalid");
    expect(error(sharePlanet(s, "p1", "planet-a", SLOTS, "x".repeat(MAX_SHARED_PLANET_LENGTH + 1)))).toBe("share_text_invalid");
    expect(sharePlanet(s, "p1", "planet-a", SLOTS, "x".repeat(MAX_SHARED_PLANET_LENGTH)).ok).toBe(true);
    const away = clone(s);
    player(away, "p1").room = "CORRIDOR_A";
    expect(error(sharePlanet(away, "p1", "planet-a", SLOTS, "x"))).toBe("share_forbidden");
    const dead = clone(s);
    player(dead, "p1").alive = false;
    expect(error(sharePlanet(dead, "p1", "planet-a", SLOTS, "x"))).toBe("share_forbidden");
    const mine = viewFor(s, "p1").inventory.find((i) => i.type === ITRACKIE_ITEM)!.id;
    const bare = must(applyAction(s, "p1", { type: "drop", item: mine }));
    expect(error(sharePlanet(bare, "p1", "planet-a", SLOTS, "x"))).toBe("share_forbidden");
    // The view says so, so the client offers Share only when it would work.
    expect([s, away, dead, bare].map((state) => viewFor(state, "p1").canSharePlanets)).toEqual([true, false, false, false]);
  });

  it("takes one slot per sector of the planet's true size, each any tag or unknown, lies included; the name is the planet's", () => {
    const s = game();
    s.planets.p1![0]!.sectors = [
      { tag: "FOREST", known: true },
      { tag: "OXYGEN", known: false },
      { tag: "RUINS", known: false },
    ];
    expect(error(sharePlanet(s, "p1", "planet-a", [null, null], "x"))).toBe("share_sectors_invalid");
    expect(error(sharePlanet(s, "p1", "planet-a", [null, null, null, null], "x"))).toBe("share_sectors_invalid");
    expect(error(sharePlanet(s, "p1", "planet-a", ["FOREST", "NOPE" as never, null], "x"))).toBe("share_sectors_invalid");
    const lied = must(sharePlanet(s, "p1", "planet-a", ["CRISTAL_FIELD", null, "OXYGEN"], "Paradise"));
    expect(viewFor(lied, "p3").sharedPlanets[0]).toMatchObject({ name: "Name-planet-a", sectors: ["CRISTAL_FIELD", null, "OXYGEN"] });
  });

  it("navigation.orbitShared links the entry shared from the orbited planet, only for readers of the feature", () => {
    const s = shared();
    expect(viewFor(s, "p3").navigation.orbitShared).toBeUndefined();
    s.navigation.orbit = "planet-a";
    expect(viewFor(s, "p3").navigation.orbitShared).toBe("sp-1");
    const mine = viewFor(s, "p3").inventory.find((i) => i.type === ITRACKIE_ITEM)!.id;
    const bare = must(applyAction(s, "p3", { type: "drop", item: mine }));
    expect(viewFor(bare, "p3").navigation.orbitShared).toBeUndefined();
    s.navigation.orbit = "planet-c";
    expect(viewFor(s, "p3").navigation.orbitShared).toBeUndefined();
  });

  it("an expedition's view links the entry shared from the planet being explored, only for readers of the feature", () => {
    const s = shared();
    s.expedition = { report: "r1", planet: "planet-b", sectors: [0], nextAt: 0, carried: {}, sabotaged: false, sabotageNext: false, hp: {}, ship: null };
    s.expeditions.push({ id: "r1", members: ["p0"], crew: [player(s, "p0").character], planet: "Name-planet-b", events: [] });
    expect(viewFor(s, "p3").expedition?.shared).toBe("sp-2");
    const mine = viewFor(s, "p3").inventory.find((i) => i.type === ITRACKIE_ITEM)!.id;
    const bare = must(applyAction(s, "p3", { type: "drop", item: mine }));
    expect(viewFor(bare, "p3").expedition).not.toHaveProperty("shared");
    s.expedition!.planet = "planet-c";
    expect(viewFor(s, "p3").expedition).not.toHaveProperty("shared");
  });

  it("an entry stored before structured shares loads with its text's first line as the name and no slots", () => {
    const { name: _n, sectors: _s, ...old } = shared().sharedPlanets[0]!;
    expect(normalizeSharedPlanet(old)).toMatchObject({ name: "North, 3: forest", sectors: [] });
  });

  it("a travel marks every entry no longer applicable but its destination's, at departure", () => {
    const s = must(applyAction(shared(), "p0", travel));
    expect(s.sharedPlanets.map((e) => [e.id, e.stale])).toEqual([["sp-1", false], ["sp-2", true]]);
    expect(viewFor(s, "p3").sharedPlanets.map((e) => e.stale)).toEqual([false, true]);
    // Arriving changes nothing more; leaving orbit marks them all, the planet just left included.
    const orbiting = nextCycle(s);
    orbiting.ship.combustion = orbiting.config.navigation.leaveOrbit.fuel;
    expect(must(applyAction(orbiting, "p0", leave)).sharedPlanets.every((e) => e.stale)).toBe(true);
  });

  it("a travel into empty space marks every entry", () => {
    const s = shared();
    s.ship.combustion = 1;
    expect(must(applyAction(s, "p0", travel)).sharedPlanets.every((e) => e.stale)).toBe(true);
  });

  it("an empty combustion chamber, a failed leave or deleting a planet marks nothing", () => {
    const empty = shared();
    empty.ship.combustion = 0;
    expect(must(applyAction(empty, "p0", travel)).sharedPlanets.some((e) => e.stale)).toBe(false);
    const deleted = must(applyAction(shared(), "p2", { type: "delete_planet", equipment: ASTRO, planet: "planet-b" }));
    expect(deleted.planets.p2!.map((p) => p.id)).toEqual(["planet-c"]);
    expect(deleted.sharedPlanets.some((e) => e.stale)).toBe(false);
    const orbiting = nextCycle(must(applyAction(shared(), "p0", travel)));
    orbiting.ship.combustion = 0;
    expect(must(applyAction(orbiting, "p0", leave)).sharedPlanets[0]!.stale).toBe(false);
  });

  it("are replayed from the sharePlanet input and parsed from the client", () => {
    expect(must(applyInput(game(), { type: "sharePlanet", planet: "planet-a", sectors: [null], text: "x", by: "p1" })).sharedPlanets).toHaveLength(1);
    const parse = (msg: unknown) => parseGameMessage(JSON.stringify(msg));
    expect(parse({ type: "sharePlanet", planet: "planet-a", sectors: ["OXYGEN", null], text: "x" })).toEqual({ type: "sharePlanet", planet: "planet-a", sectors: ["OXYGEN", null], text: "x" });
    expect(parse({ type: "sharePlanet", planet: 3, sectors: [], text: "x" })).toBeNull();
    expect(parse({ type: "sharePlanet", planet: "planet-a", sectors: [] })).toBeNull();
    expect(parse({ type: "sharePlanet", planet: "planet-a", text: "x" })).toBeNull();
    expect(parse({ type: "sharePlanet", planet: "planet-a", sectors: ["NOPE"], text: "x" })).toBeNull();
    expect(parse({ type: "sharePlanet", planet: "planet-a", sectors: [0], text: "x" })).toBeNull();
    expect(parse({ type: "chat", channel: "sp-4", text: "hi" })).toEqual({ type: "chat", channel: "sp-4", text: "hi" });
    expect(parse({ type: "chat", channel: "sp-x", text: "hi" })).toBeNull();
  });

  it("moderation takes the longer limits for a shared planet", () => {
    const limits = { length: MAX_SHARED_PLANET_LENGTH, lines: MAX_SHARED_PLANET_LINES };
    const long = "x".repeat(400);
    expect(moderateChat(long).ok).toBe(false);
    expect(moderateChat(long, undefined, limits)).toEqual({ ok: true, text: long });
    expect(moderateChat(Array(MAX_SHARED_PLANET_LINES + 1).fill("a").join("\n"), undefined, limits).ok).toBe(false);
  });
});
