// Stored rooms across builds (#384, docs/plans/normalize-state.md): the committed fixtures in ./stored are snapshots
// GameRoom wrote at an older STATE_VERSION, never refreshed, so every run loads the oldest one through every upgrade
// step and every `added()` default. The same tests run on rooms generated now (./storedRooms.ts), for the current shape.
//
// New fixtures (when a later shape is worth keeping, or a breaking step lands):
//   WRITE_STORED_FIXTURES=1 npm test -w server -- storedRooms.test.ts
// writes the moments missing at this build's STATE_VERSION and its registry snapshot. It never overwrites a file.

import {
  BIOS_OPTIONS,
  BLUEPRINTS,
  CHARACTERS,
  CPU_PRIORITIES,
  CREW_LOCKS,
  DEFAULT_CONFIG,
  EQUIPMENT_TYPES,
  ITEM_TYPES,
  MODIFIERS,
  MUSH_SKILLS,
  PROJECTS,
  RESEARCH_IDS,
  RESOURCE_IDS,
  SKILLS,
  STATE_VERSION,
  TITLE_IDS,
  UPGRADE_STEPS,
  fullViewFor,
  statusIdsFor,
  normalizeGame,
  normalizeOverrides,
  normalizeSeatStarts,
  perspective,
  resolveConfig,
  upgrade,
  viewFor,
  type ConfigOverrides,
  type GameServerMessage,
  type GameState,
} from "@mush2/shared";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addProbes, at, probesIn, under, walk } from "../../shared/tests/storedShape.ts";
import { clockCycleStart, cycleMs } from "../src/cycleClock.ts";
import { FakeConnection, FakeServer, FakeStorage } from "../src/testing/fakes.ts";
import { gameAt, MOMENTS, storedRoom } from "./storedRooms.ts";

vi.mock("partyserver", () => ({ Server: FakeServer }));
const { GameRoom } = await import("../src/GameRoom.ts");

type Raw = Record<string, any>;
const DIR = new URL("./stored/", import.meta.url);
const json = <T>(v: unknown): T => JSON.parse(JSON.stringify(v)) as T;

/** Every registry whose ids a stored game holds, by name. The snapshot files list these names' ids. */
const REGISTRIES: Record<string, () => readonly string[]> = {
  ITEM_TYPES: () => Object.keys(ITEM_TYPES),
  SKILLS: () => SKILLS,
  MUSH_SKILLS: () => MUSH_SKILLS,
  MODIFIERS: () => Object.keys(MODIFIERS),
  BLUEPRINTS: () => Object.keys(BLUEPRINTS),
  RESEARCH: () => RESEARCH_IDS,
  PROJECTS: () => PROJECTS.map((p) => p.id),
  STATUSES: () => statusIdsFor(DEFAULT_CONFIG.diseases.allDiseases, DEFAULT_CONFIG.diseases.allInjuries),
  DISEASES: () => Object.keys(DEFAULT_CONFIG.diseases),
  EQUIPMENT_TYPES: () => Object.keys(EQUIPMENT_TYPES),
  ROOMS: () => Object.keys(DEFAULT_CONFIG.rooms),
  CHARACTERS: () => CHARACTERS.map((c) => c.id),
  TITLES: () => TITLE_IDS,
  BIOS_OPTIONS: () => [...BIOS_OPTIONS, "cpu_priority", "crew_lock"],
  CPU_PRIORITIES: () => CPU_PRIORITIES,
  CREW_LOCKS: () => CREW_LOCKS,
  RESOURCES: () => RESOURCE_IDS,
  // Log lines are ids the client names (`logEvent.<key>`); plural forms share one key.
  LOG_EVENTS: () => [...new Set(Object.keys(englishLog()).map((k) => k.replace(/_(zero|one|two|few|many|other)$/, "")))],
};
const englishLog = (): Record<string, string> => JSON.parse(readFileSync(new URL("../../web/src/locales/en.json", import.meta.url), "utf8")).logEvent;

/**
 * Where the ids in a stored game come from, by path: values, and dictionary keys. Not exhaustive (best effort, #384):
 * a field holding registry ids that isn't listed here goes unchecked.
 */
const VALUE_IDS: Record<string, readonly string[]> = {
  "game.items[].type": ["ITEM_TYPES"],
  "game.space[].type": ["ITEM_TYPES"],
  "game.players[].character": ["CHARACTERS"],
  "game.players[].bodyTakenBy": ["CHARACTERS"],
  "game.players[].room": ["ROOMS"],
  "game.players[].enteredFrom": ["ROOMS"],
  "game.players[].skills[]": ["SKILLS"],
  "game.players[].bookSkill": ["SKILLS"],
  "game.players[].mushSkills[]": ["MUSH_SKILLS"],
  "game.players[].modifiers[]": ["MODIFIERS"],
  "game.players[].statuses[]": ["STATUSES", "DISEASES"],
  "game.players[].diseaseTrackers[].name": ["STATUSES", "DISEASES"],
  "game.equipment.*[].type": ["EQUIPMENT_TYPES"],
  "game.log[].key": ["LOG_EVENTS"],
  "game.log[].room": ["ROOMS"],
  "game.fires[]": ["ROOMS"],
  "game.pendingFires[]": ["ROOMS"],
  "game.projectDeck[]": ["PROJECTS"],
  "game.bios.cpu_priority": ["CPU_PRIORITIES"],
  "game.bios.crew_lock": ["CREW_LOCKS"],
  "starts.*.character": ["CHARACTERS"],
};
const KEY_IDS: Record<string, readonly string[]> = {
  "game.equipment": ["ROOMS"],
  "game.research": ["RESEARCH"],
  "game.projects": ["PROJECTS"],
  "game.relay.research": ["RESEARCH"],
  "game.relay.projects": ["PROJECTS"],
  "game.patrolShips": ["ROOMS"],
  "game.titles": ["TITLES"],
  "game.bios": ["BIOS_OPTIONS"],
  "game.players[].resources": ["RESOURCES"],
};

/** Changed on every load, by design rather than by a step: the action under way and the queue are dropped (#384, amendment 5). */
const DROPPED_ON_LOAD = ["game.players[].current", "game.players[].queue"];

interface Fixture {
  name: string;
  version: number;
  raw: Raw;
}

const fixtures: Fixture[] = readdirSync(DIR)
  .flatMap((file) => {
    const m = /^v(\d+)-(\w+)\.json$/.exec(file);
    return m && m[2] !== "registries" ? [{ name: file, version: Number(m[1]), raw: JSON.parse(readFileSync(new URL(file, DIR), "utf8")) as Raw }] : [];
  })
  .sort((a, b) => a.version - b.version || a.name.localeCompare(b.name));

const registrySnapshots = readdirSync(DIR).flatMap((file) => {
  const m = /^v(\d+)-registries\.json$/.exec(file);
  return m ? [{ name: file, version: Number(m[1]), ids: JSON.parse(readFileSync(new URL(file, DIR), "utf8")) as Record<string, string[]> }] : [];
});

/** Rooms generated by this build, one per moment, for the current shape. */
const generated: Fixture[] = await Promise.all(
  MOMENTS.map(async (moment) => ({ name: `generated ${moment}`, version: STATE_VERSION, raw: await storedRoom(GameRoom, gameAt(moment)) })),
);

/** What `onStart` makes of a stored room: upgraded, then normalized. As JSON, without the config `normalizeGame` resolves. */
function load(raw: Raw, version = raw.version as number): Raw {
  const copy = structuredClone(raw);
  upgrade(copy as { game: unknown; overrides: unknown }, version);
  const overrides = normalizeOverrides(copy.overrides);
  const { config: _config, ...game } = normalizeGame(copy.game, overrides);
  return json({ game, overrides, starts: copy.starts && normalizeSeatStarts(copy.starts) });
}
const normalizedParts = (raw: Raw): Raw => ({ game: raw.game, overrides: raw.overrides, starts: raw.starts });

const stepsAfter = (version: number) => UPGRADE_STEPS.filter((step) => step.to > version);

afterEach(() => {
  vi.useRealTimers();
});

describe("stored room fixtures (#384)", () => {
  it.runIf(process.env.WRITE_STORED_FIXTURES)("writes the fixtures missing at this STATE_VERSION, never overwriting one", async () => {
    for (const moment of MOMENTS) {
      const file = new URL(`v${STATE_VERSION}-${moment}.json`, DIR);
      if (!existsSync(file)) writeFileSync(file, `${JSON.stringify(await storedRoom(GameRoom, gameAt(moment)))}\n`);
    }
    const registries = new URL(`v${STATE_VERSION}-registries.json`, DIR);
    const ids = Object.fromEntries(Object.entries(REGISTRIES).map(([name, list]) => [name, [...list()].sort()]));
    if (!existsSync(registries)) writeFileSync(registries, `${JSON.stringify(ids, null, 1)}\n`);
  });

  it("has every moment at the oldest version still read, and a registry snapshot for each version", () => {
    const oldest = fixtures[0]!.version;
    expect(fixtures.filter((f) => f.version === oldest).map((f) => f.name)).toEqual(MOMENTS.map((m) => `v${oldest}-${m}.json`).sort());
    expect(registrySnapshots.map((s) => s.version).sort()).toEqual([...new Set(fixtures.map((f) => f.version))]);
    for (const f of fixtures) expect(f.raw.version, f.name).toBe(f.version);
  });

  it("holds what it was taken for: arriving, in orbit, two players mid-action", () => {
    for (const f of [...fixtures, ...generated]) {
      const { game } = f.raw;
      if (f.name.includes("arriving")) expect(game.navigation.arriving, f.name).not.toBeNull();
      if (f.name.includes("orbit")) expect(game.navigation.orbit, f.name).not.toBeNull();
      if (f.name.includes("midAction")) expect(game.players.filter((p: Raw) => p.current !== null || p.queue.length > 0).length, f.name).toBeGreaterThanOrEqual(2);
    }
  });

  // 1. Values preserved.
  it.each(fixtures.map((f) => [f.name, f] as const))("%s: every stored value is where it was after loading, unless a step or the queue drop says otherwise", (_name, f) => {
    const declared = [...DROPPED_ON_LOAD, ...stepsAfter(f.version).flatMap((step) => step.paths ?? [])];
    const loaded = load(f.raw);
    const lost: string[] = [];
    walk(normalizedParts(f.raw), (path, keys, value) => {
      if (declared.some((p) => under(path, p))) return;
      const after = at(loaded, keys);
      const leaf = value === null || typeof value !== "object";
      const empty = !leaf && Object.keys(value).length === 0;
      if (leaf ? after !== value : empty && (after === null || typeof after !== "object" || Array.isArray(after) !== Array.isArray(value))) {
        lost.push(`${keys.join(".")}: ${JSON.stringify(value)} became ${JSON.stringify(after)}`);
      }
    });
    expect(lost, "A stored field was removed or renamed, or its value changed: add an upgrade step that declares its path (normalizeState.ts)").toEqual([]);
  });

  // 2. Registry ids still exist.
  it.each(registrySnapshots.map((s) => [s.name, s] as const))("%s: every id still exists, unless a step renamed or removed it", (_name, snapshot) => {
    const declared = new Set(stepsAfter(snapshot.version).flatMap((step) => step.ids ?? []));
    const gone: string[] = [];
    for (const [registry, ids] of Object.entries(snapshot.ids)) {
      const current = new Set(REGISTRIES[registry]?.() ?? []);
      for (const id of ids) if (!current.has(id) && !declared.has(`${registry}.${id}`)) gone.push(`${registry}.${id}`);
    }
    expect(gone, "A registry id is gone: ids are permanent (rename what players see in the locale files), or add an upgrade step that converts it and lists it in `ids`").toEqual([]);
  });

  it.each([...fixtures, ...generated].map((f) => [f.name, f] as const))("%s: the ids a loaded room holds are this build's (best effort)", (_name, f) => {
    const known = Object.fromEntries(Object.entries(REGISTRIES).map(([name, list]) => [name, new Set(list())]));
    const bad: string[] = [];
    const check = (registries: readonly string[], id: unknown, where: string) => {
      if (!registries.some((r) => known[r]!.has(id as string))) bad.push(`${where}: ${JSON.stringify(id)}`);
    };
    walk(load(f.raw), (path, keys, value) => {
      if (VALUE_IDS[path] && value !== undefined) check(VALUE_IDS[path], value, keys.join("."));
      if (KEY_IDS[path] && value && typeof value === "object") for (const key of Object.keys(value)) check(KEY_IDS[path], key, `${keys.join(".")} key`);
    });
    expect(bad).toEqual([]);
  });

  // 3. Probes stripped.
  it.each([...fixtures, ...generated].map((f) => [f.name, f] as const))("%s: a key on any struct is dropped, so every nested struct goes through its normalizer", (_name, f) => {
    const raw = structuredClone(f.raw);
    const parts = normalizedParts(raw);
    expect(addProbes(parts)).toBeGreaterThan(100);
    expect(probesIn(load(Object.assign(raw, parts), f.version))).toEqual([]);
  });

  // 4. Idempotent.
  it.each([...fixtures, ...generated].map((f) => [f.name, f] as const))("%s: loading what a load gave back changes nothing", (_name, f) => {
    const once = load(f.raw);
    expect(load({ ...f.raw, ...once, version: STATE_VERSION })).toEqual(once);
  });

  // 5. Still plays.
  it.each([...fixtures, ...generated].map((f) => [f.name, f] as const))("%s: a GameRoom loads it, every seat sees the game and its replay frame, and a cycle passes", async (_name, f) => {
    const overrides = normalizeOverrides(f.raw.overrides as ConfigOverrides);
    const cycleLength = cycleMs({} as never, resolveConfig(overrides).cycleHours);
    vi.useFakeTimers();
    vi.setSystemTime(clockCycleStart(f.raw.clockCycle, cycleLength) + 1000);
    const storage = new FakeStorage();
    await storage.put("game", f.raw);
    const room = new GameRoom({ storage } as never, { RULES_VERSION: "test" } as never);
    await room.onStart();
    const inside = room as unknown as { game: GameState | null; unavailable: boolean; starts: Record<string, never> | null };
    expect(inside.unavailable).toBe(false);
    const game = inside.game!;
    const full = fullViewFor(game, inside.starts);
    for (const p of game.players) {
      expect(viewFor(game, p.id).you.id).toBe(p.id);
      expect(() => perspective(full, p.mind)).not.toThrow();
    }
    // A seat connects through its token and gets its view.
    const [token] = Object.keys(f.raw.tokens);
    const conn = new FakeConnection<{ playerId: string }>("c");
    (room as unknown as FakeServer).connections.add(conn as never);
    room.onConnect(conn as never, { request: new Request(`http://x/parties/game-room/r?token=${token}`) } as never);
    expect(conn.closed).toBeFalsy();
    expect(conn.messages<GameServerMessage>().some((m) => m.type === "view")).toBe(true);

    const cycle = game.cycle;
    vi.setSystemTime(clockCycleStart(f.raw.clockCycle + 1, cycleLength) + 1000);
    await room.onAlarm();
    expect(inside.game!.cycle).toBe(cycle + 1);
    expect((await storage.get<Raw>("game"))!.version).toBe(STATE_VERSION);
  });
});
