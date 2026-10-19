import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { generatePlanet, pickSeekSector, PLANET_TAGS, PLANET_TAG_IDS } from "../src/planets.ts";
import { parseGameMessage } from "../src/protocol.ts";
import { applyAction, createGame, viewFor } from "../src/rules.ts";
import { addStatus } from "../src/statuses.ts";
import type { Action, GameState, Planet } from "../src/types.ts";
import { clone, makeSeats, must, offered, option } from "./support.ts";

const seats = makeSeats(3, "others");
const TERMINAL = "COMMAND_CENTER:ASTRO_MODULE";
const scan: Action = { type: "scan_planet", equipment: TERMINAL };
const analyze = (planet: string): Action => ({ type: "analyze_planet", equipment: TERMINAL, planet });
const del = (planet: string): Action => ({ type: "delete_planet", planet });
const { astro } = DEFAULT_CONFIG;

function game(room = "COMMAND_CENTER"): GameState {
  const state = createGame(seats, structuredClone(DEFAULT_CONFIG), 7);
  for (const p of state.players) p.room = room;
  return state;
}

/** Scan with the odds forced: certain success or certain failure. */
function forcedScan(s: GameState, id: string, succeed: boolean): GameState {
  const t = clone(s);
  t.config.astro.scan.chance = succeed ? 1 : 0;
  const next = must(applyAction(t, id, scan));
  next.config.astro.scan.chance = s.config.astro.scan.chance;
  return next;
}

describe("planet generation", () => {
  it("is deterministic for a seed and follows the original's size and per-tag limits", () => {
    expect(generatePlanet(42, "x")).toEqual(generatePlanet(42, "x"));
    let rng = 1;
    const sizes = new Set<number>();
    const names = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      let planet: Planet;
      [planet, rng] = generatePlanet(rng, `p${i}`);
      sizes.add(planet.sectors.length);
      names.add(planet.name);
      expect(planet.sectors.every((s) => !s.known && PLANET_TAG_IDS.includes(s.tag))).toBe(true);
      for (const tag of PLANET_TAG_IDS) expect(planet.sectors.filter((s) => s.tag === tag).length).toBeLessThanOrEqual(PLANET_TAGS[tag].max);
    }
    expect([...sizes].sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10, 12]);
    expect(names.size).toBeGreaterThan(1000);
  });

  it("reveals unknown sectors weighted by seek, and nothing once all are known", () => {
    const planet: Planet = { id: "x", name: "x", sectors: [{ tag: "WRECK", known: false }, { tag: "FOREST", known: false }, { tag: "OCEAN", known: true }] };
    let rng = 3;
    const hits = [0, 0, 0];
    for (let i = 0; i < 1300; i++) {
      let index: number | null;
      [index, rng] = pickSeekSector(rng, planet);
      hits[index!]!++;
    }
    expect(hits[2]).toBe(0);
    // WRECK seek 1 against FOREST seek 12: about 100 to 1200.
    expect(hits[0]).toBeGreaterThan(50);
    expect(hits[0]).toBeLessThan(160);
    expect(pickSeekSector(9, { ...planet, sectors: planet.sectors.map((s) => ({ ...s, known: true })) })[0]).toBeNull();
  });
});

describe("Astro terminal planets", () => {
  it("pins the decided numbers: scan 3 AP at 50% x1.25 per failure, analysis 2 AP, 2 planets each", () => {
    expect([astro.scan.cost.ap, astro.scan.chance, astro.scan.failureMultiplier, astro.analyze.cost.ap, astro.maxPlanets]).toEqual([3, 0.5, 1.25, 2, 2]);
  });

  it("offers a scan only at the Astro terminal, and costs its AP", () => {
    const s = game();
    expect(option(s, "p0", { type: "scan_planet" })?.action).toEqual(scan);
    expect(offered(game("LABORATORY"), "p0").some((a) => a.type === "scan_planet")).toBe(false);
    const ap = s.players[0]!.ap;
    expect(forcedScan(s, "p0", true).players[0]!.ap).toBe(ap - astro.scan.cost.ap);
  });

  it("gives the scanner a private planet with every sector unknown", () => {
    const s = forcedScan(game(), "p0", true);
    const planets = viewFor(s, "p0").planets;
    expect(planets).toHaveLength(1);
    expect(planets[0]!.sectors.length).toBeGreaterThanOrEqual(2);
    expect(planets[0]!.sectors.every((sector) => sector === null)).toBe(true);
    expect(s.log.find((e) => e.key === "planetFound")).toMatchObject({ visibleTo: ["p0"], params: { planet: planets[0]!.name } });
  });

  it("raises the odds by x1.25 for each failure in a row, per player, and a success resets them", () => {
    let s = game();
    const chance = (st: GameState, id: string) => option(st, id, { type: "scan_planet" })?.chance;
    expect(chance(s, "p0")).toBe(astro.scan.chance);
    s = forcedScan(s, "p0", false);
    expect(chance(s, "p0")).toBe(astro.scan.chance * astro.scan.failureMultiplier);
    s = forcedScan(s, "p0", false);
    expect(chance(s, "p0")).toBe(astro.scan.chance * astro.scan.failureMultiplier ** 2);
    expect(chance(s, "p1")).toBe(astro.scan.chance);
    expect(viewFor(s, "p0").planets).toEqual([]);
    expect(s.log.filter((e) => e.key === "planetNotFound" && e.visibleTo.includes("p0"))).toHaveLength(2);
    s.scanFailures.p0 = 10;
    expect(chance(s, "p0")).toBe(1);
    s.players[0]!.ap = 12;
    s = forcedScan(s, "p0", true);
    expect(chance(s, "p0")).toBe(astro.scan.chance);
  });

  it("caps each player at 2 planets; deleting one frees a slot", () => {
    let s = game();
    for (let i = 0; i < astro.maxPlanets; i++) {
      s.players[0]!.ap = 12;
      s = forcedScan(s, "p0", true);
    }
    s.players[0]!.ap = 12;
    expect(offered(s, "p0").some((a) => a.type === "scan_planet")).toBe(false);
    expect(applyAction(s, "p0", scan).ok).toBe(false);
    // The cap is per player.
    expect(forcedScan(s, "p1", true).planets.p1).toHaveLength(1);
    const first = s.planets.p0![0]!.id;
    s = must(applyAction(s, "p0", del(first)));
    expect(s.planets.p0!.map((p) => p.id)).not.toContain(first);
    expect(offered(s, "p0").some((a) => a.type === "scan_planet")).toBe(true);
  });

  it("deletes anywhere, for free, silently, and only your own planets", () => {
    let s = forcedScan(game(), "p0", true);
    const id = s.planets.p0![0]!.id;
    s.players[0]!.room = "REFECTORY";
    s.players[0]!.ap = 0;
    expect(applyAction(s, "p1", del(id)).ok).toBe(false);
    const logs = s.log.length;
    s = must(applyAction(s, "p0", del(id)));
    expect(s.planets.p0).toEqual([]);
    expect(s.log).toHaveLength(logs);
  });

  it("analysis reveals exactly one sector of your own planet, only to you, and names the planet in the room log", () => {
    let s = game();
    s.players[2]!.room = "REFECTORY";
    s = forcedScan(s, "p0", true);
    const planet = s.planets.p0![0]!;
    const ap = s.players[0]!.ap;
    s = must(applyAction(s, "p0", analyze(planet.id)));
    expect(s.players[0]!.ap).toBe(ap - astro.analyze.cost.ap);
    const sectors = viewFor(s, "p0").planets[0]!.sectors;
    expect(sectors.filter((x) => x !== null)).toHaveLength(1);
    expect(sectors.find((x) => x !== null)).toBe(s.planets.p0![0]!.sectors.find((x) => x.known)!.tag);
    const line = viewFor(s, "p1").log.find((e) => e.key === "analyzedPlanet");
    expect(line?.params).toEqual({ name: s.players[0]!.character, planet: planet.name });
    expect(viewFor(s, "p2").log.some((e) => e.key === "analyzedPlanet")).toBe(false);
    // Nobody else can analyse it.
    expect(applyAction(s, "p1", analyze(planet.id)).ok).toBe(false);
  });

  it("stops offering analysis once every sector is known", () => {
    let s = forcedScan(game(), "p0", true);
    const id = s.planets.p0![0]!.id;
    for (const _ of s.planets.p0![0]!.sectors) {
      s.players[0]!.ap = 12;
      s = must(applyAction(s, "p0", analyze(id)));
    }
    expect(viewFor(s, "p0").planets[0]!.sectors.every((x) => x !== null)).toBe(true);
    s.players[0]!.ap = 12;
    expect(applyAction(s, "p0", analyze(id)).ok).toBe(false);
    expect(offered(s, "p0").some((a) => a.type === "analyze_planet")).toBe(false);
  });

  it("refuses scans and analyses when dirty, too poor or away from the terminal, leaving state unchanged", () => {
    const base = forcedScan(game(), "p0", true);
    const id = base.planets.p0![0]!.id;
    const dirty = clone(base);
    addStatus(dirty.players[0]!, "dirty");
    const poor = clone(base);
    poor.players[0]!.ap = astro.analyze.cost.ap - 1;
    const away = clone(base);
    away.players[0]!.room = "LABORATORY";
    for (const s of [dirty, poor, away]) {
      const before = JSON.stringify(s);
      expect(applyAction(s, "p0", scan).ok).toBe(false);
      expect(applyAction(s, "p0", analyze(id)).ok).toBe(false);
      expect(JSON.stringify(s)).toBe(before);
    }
  });

  it("says only that someone scanned, success or not, to the room", () => {
    let s = game();
    s = forcedScan(s, "p0", true);
    s = forcedScan(s, "p0", false);
    const room = viewFor(s, "p1").log;
    expect(room.filter((e) => e.key === "scannedPlanets")).toHaveLength(2);
    expect(room.every((e) => e.params?.planet === undefined)).toBe(true);
    expect(room.some((e) => e.key === "planetFound" || e.key === "planetNotFound")).toBe(false);
  });

  it("never shows anyone else's planets or an unknown sector's tag", () => {
    let s = forcedScan(game(), "p0", true);
    s = must(applyAction(s, "p0", analyze(s.planets.p0![0]!.id)));
    const planet = s.planets.p0![0]!;
    const hidden = planet.sectors.filter((x) => !x.known).map((x) => x.tag);
    const mine = JSON.stringify(viewFor(s, "p0").planets);
    for (const tag of new Set(hidden)) if (!planet.sectors.some((x) => x.known && x.tag === tag)) expect(mine).not.toContain(tag);
    for (const id of ["p1", "p2"]) {
      const view = viewFor(s, id);
      expect(view.planets).toEqual([]);
      expect(JSON.stringify(view)).not.toContain(planet.id);
      expect(JSON.stringify(view)).not.toContain("scanFailures");
    }
    expect(JSON.stringify(viewFor(s, "p0"))).not.toContain("scanFailures");
  });

  it("parses from the wire, and rejects malformed ones", () => {
    for (const action of [scan, analyze("planet-1"), del("planet-1")]) expect(parseGameMessage(JSON.stringify({ type: "action", action }))).toEqual({ type: "action", action });
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "analyze_planet", equipment: TERMINAL } }))).toBeNull();
    expect(parseGameMessage(JSON.stringify({ type: "action", action: { type: "delete_planet" } }))).toBeNull();
  });
});
