import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { createGame } from "../src/rules.ts";
import { added, NormalizeError, normalizeContainer, normalizeGame, normalizeHunterTarget, normalizeOverrides, normalizePlanSlot, normalizePlanTask, normalizeSpot } from "../src/normalizeState.ts";
import type { ConfigOverrides, GameState, PlayerState } from "../src/types.ts";
import { play } from "./randomGame.ts";
import { makeSeats } from "./support.ts";

/** A game as storage hands it back: plain JSON, without its config. */
type Raw = Record<string, any>;
const stored = (game: GameState): Raw => {
  const { config: _config, ...rest } = JSON.parse(JSON.stringify(game)) as GameState;
  return rest;
};

/** The game as a load should give it back: the same, with every action under way and queued dropped (#384). */
const withoutQueues = (game: GameState): GameState => {
  const copy = JSON.parse(JSON.stringify(game)) as GameState;
  for (const p of copy.players) Object.assign(p, { current: null, queue: [] });
  return copy;
};

const fresh = () => ({ game: createGame(makeSeats(3), DEFAULT_CONFIG, 7), overrides: {} as ConfigOverrides });
// A seeded random game some way in (#335): chat, channels, items moved, cycles passed, actions under way.
const played = () => ({ game: play(600, 11).state, overrides: { manualCycles: true } as ConfigOverrides });

/** Every object and array reachable from `value`. */
function objectsIn(value: unknown, into = new Set<object>()): Set<object> {
  if (value === null || typeof value !== "object" || into.has(value)) return into;
  into.add(value);
  for (const child of Object.values(value)) objectsIn(child, into);
  return into;
}

describe("normalizeGame", () => {
  for (const [name, make] of [
    ["a fresh 3-seat game", fresh],
    ["a random game a few cycles in", played],
  ] as const) {
    it(`gives back ${name} as it was, without its queues`, () => {
      const { game, overrides } = make();
      expect(normalizeGame(stored(game), overrides)).toStrictEqual(withoutQueues(game));
    });

    it(`is idempotent on ${name}`, () => {
      const { game, overrides } = make();
      const once = normalizeGame(stored(game), overrides);
      expect(normalizeGame(stored(once), overrides)).toStrictEqual(once);
    });

    it(`shares nothing with its input, for ${name}`, () => {
      const { game, overrides } = make();
      const raw = stored(game);
      const input = objectsIn(raw);
      for (const object of objectsIn(normalizeGame(raw, overrides))) expect(input.has(object)).toBe(false);
    });
  }

  it("the random game has something to drop and something in the nested structs", () => {
    const { game } = played();
    // Guards the round trip above against testing an empty game.
    expect(game.cycle).toBeGreaterThan(3);
    expect(game.channels.length + game.chat.length).toBeGreaterThan(0);
    expect(game.players.some((p) => p.spot !== undefined)).toBe(true);
  });

  it("gives back, as they were, the collections a random game leaves empty", () => {
    const { game, overrides } = fresh();
    const [a, b] = game.players as [PlayerState, PlayerState];
    // Every optional field set, so a field copied from the wrong key shows.
    Object.assign(a, {
      transferUsed: true,
      apprenticeUsed: true,
      geniusUsed: true,
      bodyTakenBy: b.character,
      spot: { kind: "door", door: "BRIDGE" },
      enteredFrom: "BRIDGE",
      lyingIn: "BED",
      lyingSince: 2,
      pushedBy: b.id,
      outcastBy: b.id,
      lastSeenAt: 99,
      inactivity: "inactive",
      boringToday: true,
      fertileToday: true,
      chitchatToday: true,
      interrogatedToday: true,
      snoopedToday: ["FRONT_STORAGE"],
      mycoscannedToday: true,
      accommodationOffers: [{ by: b.id, until: 500 }],
      diseaseTrackers: [{ name: "cold", duration: 3, resistance: 1, complete: false, forever: true }],
      immuneUntil: 9,
      bookSkill: "cook",
    } satisfies Partial<PlayerState>);
    game.items[0]!.hiddenBy = a.id;
    Object.assign(game.items[1]!, { of: b.id, builds: "x", charges: 2, teaches: "y", spores: 1, broken: true, plant: { species: "fruit_banana", age: null, thirst: 2, sick: true } });
    game.space = [{ id: "d1", type: "metal_scraps", plant: { species: "fruit_banana", age: 1, thirst: 0, sick: false } }];
    game.equipment.BRIDGE = [{ id: "BRIDGE:X", type: "X", broken: true }];
    game.log.push({ id: 77, cycle: 1, at: 5, key: "k", params: { n: 1, s: "t" }, room: "BRIDGE", visibleTo: [a.id], level: "warning" });
    game.chat.push({ id: 78, seq: 0, cycle: 1, at: 6, channel: "mush", from: null, isBot: false, text: "", system: { key: "s", params: { n: 2 } } });
    game.channels.push({ id: "pc-1", name: "", members: [a.id, b.id], createdBy: a.id, planningClosed: true, day: 1, cycleOfDay: 2 });
    game.threads.push({ id: "th-1", name: "t", from: 3, createdBy: b.id, cycle: 4 });
    game.plans.push({
      id: "plan-1",
      channel: "pc-1",
      author: a.id,
      room: "BRIDGE",
      purpose: "meal",
      status: "called",
      postedDay: 1,
      slots: [
        { kind: "onCall", holder: b.id, reservedFor: b.id, outcome: "arrived" },
        { kind: "task", task: { type: "research", research: "r" }, holder: null, reservedFor: a.id, done: true, struck: "already_done" },
        { kind: "task", task: { type: "repair_pilgred" }, holder: a.id, done: false },
      ],
    });
    game.planets[a.id] = [{ id: "pl-1", name: "Zed", direction: game.navigation.heading, distance: 3, sectors: [{ tag: "FOREST" as never, known: true, explored: true }] }];
    game.sharedPlanets.push({ id: "sp-1", text: "nice", by: a.id, day: 1, cycleOfDay: 3, stale: true, planet: "pl-1" });
    game.expeditions.push({
      id: "ex-1",
      members: [a.id, b.id],
      crew: [a.character, b.character],
      planet: "Zed",
      events: [
        { sector: "LANDING", kind: "fight", amount: 4, item: "i", fight: { strength: 3, grenades: 1, won: true }, hurt: [{ name: a.character, hp: 2 }], died: [b.character] },
        { sector: "FOREST", kind: "nothing" },
      ],
    });
    game.navigation = { heading: game.navigation.heading, orbit: "pl-1", arriving: { planet: "pl-1" }, lastTurn: { n: 3, side: "left" } };
    game.hunters.list.push({ id: "h1", hp: 2, hitChance: 0.4, target: { kind: "ship" } });
    game.relay.projects.p = { tokens: [{ by: a.id, base: 3, roll: 0.5, unpenalized: true }] };
    game.relay.research.r = { tokens: [{ by: a.id, base: 3, roll: 0.5 }], pending: [{ by: b.id, base: 2, roll: 0.1, contaminatedBy: b.id }] };
    game.chatOutbox = { sealed: [{ channel: "global", page: 0, messages: [game.chat.at(-1)!] }], dropped: [{ channel: "pc-2", pages: 1 }] };
    expect(normalizeGame(stored(game), overrides)).toStrictEqual(withoutQueues(game));
  });

  it("drops the action under way and the queue", () => {
    const { game, overrides } = fresh();
    const raw = stored(game);
    raw.players[0].current = { action: { type: "ready" }, adjustment: { ap: 0, mp: 0 }, since: 1, until: 2 };
    raw.players[0].queue = [{ action: { type: "ready" }, adjustment: { ap: 0, mp: 0 } }];
    const player = normalizeGame(raw, overrides).players[0]!;
    expect(player.current).toBeNull();
    expect(player.queue).toEqual([]);
  });

  it("resolves the config from the overrides", () => {
    const { game } = fresh();
    expect(normalizeGame(stored(game), { cycleHours: 2 }).config.cyclesPerDay).toBe(12);
  });

  it("keeps a stored null", () => {
    const { game, overrides } = fresh();
    const raw = stored(game);
    Object.assign(raw, { winner: null, ending: null });
    raw.players[0].satietyZeroSince = null;
    raw.navigation = { heading: raw.navigation.heading, orbit: null, arriving: { planet: null }, lastTurn: null };
    raw.hunters.since = null;
    raw.hunters.list = [{ id: "h1", hp: 3, hitChance: 0.5, target: null }];
    raw.titles.commander = null;
    const out = normalizeGame(raw, overrides);
    expect([out.winner, out.ending, out.players[0]!.satietyZeroSince, out.navigation.orbit, out.navigation.lastTurn]).toEqual([null, null, null, null, null]);
    expect(out.navigation.arriving).toEqual({ planet: null });
    expect(out.hunters.since).toBeNull();
    expect(out.hunters.list[0]!.target).toBeNull();
    expect(out.titles.commander).toBeNull();
  });

  it("removes an undefined-valued optional key and any key it doesn't know", () => {
    const { game, overrides } = fresh();
    const raw = stored(game);
    // Durable Object storage keeps undefined-valued keys through structured clone.
    raw.items[0].of = undefined;
    raw.items[0].__probe = 1;
    raw.__probe = 1;
    raw.players[0].lyingIn = undefined;
    const out = normalizeGame(raw, overrides);
    expect("of" in out.items[0]!).toBe(false);
    expect("__probe" in out.items[0]!).toBe(false);
    expect("__probe" in out).toBe(false);
    expect("lyingIn" in out.players[0]!).toBe(false);
  });

  it("throws on a missing required field, naming its type", () => {
    const missing = (edit: (raw: Raw) => void) => {
      const { game, overrides } = fresh();
      const raw = stored(game);
      edit(raw);
      return () => normalizeGame(raw, overrides);
    };
    expect(missing((raw) => delete raw.items[0].type)).toThrow(new NormalizeError("ItemState.type missing"));
    expect(missing((raw) => delete raw.players[1].hp)).toThrow(new NormalizeError("PlayerState.hp missing"));
    expect(missing((raw) => delete raw.players[1].resources.eng)).toThrow(new NormalizeError("PlayerState.resources.eng missing"));
    expect(missing((raw) => delete raw.bios.actopi)).toThrow(new NormalizeError("GameCore.bios.actopi missing"));
    expect(missing((raw) => delete raw.nextLogId)).toThrow(new NormalizeError("GameCore.nextLogId missing"));
    expect(missing((raw) => delete raw.rng)).toThrow(new NormalizeError("GameState.rng missing"));
    // An undefined-valued key is as missing as an absent one.
    expect(missing((raw) => (raw.ship.hull = undefined))).toThrow(new NormalizeError("ShipResources.hull missing"));
  });
});

describe("union normalizers", () => {
  const cases: [string, (raw: any) => unknown, Raw, string][] = [
    ["Container", normalizeContainer, { kind: "room", id: "BRIDGE" }, "kind"],
    ["Spot", normalizeSpot, { kind: "cell", x: 1, y: 2, sitting: true }, "kind"],
    ["HunterTarget", normalizeHunterTarget, { kind: "patrol", id: "PATROL_SHIP_ALPHA_TAMARIN" }, "kind"],
    ["PlanSlot", normalizePlanSlot, { kind: "task", task: { type: "heal", target: "p1" }, holder: null, done: false }, "kind"],
    ["PlanTask", normalizePlanTask, { type: "bring", itemType: "medikit" }, "type"],
  ];

  for (const [type, normalize, valid, key] of cases) {
    it(`${type}: keeps a known variant and throws on an unknown or missing ${key}`, () => {
      expect(normalize(valid)).toStrictEqual(valid);
      expect(() => normalize({ ...valid, [key]: "teleporter" })).toThrow(new NormalizeError(`${type}.${key} unknown: "teleporter"`));
      expect(() => normalize({ ...valid, [key]: undefined })).toThrow(new NormalizeError(`${type}.${key} missing`));
    });
  }

  it("a variant missing one of its fields throws with the type's name", () => {
    expect(() => normalizeSpot({ kind: "cell", x: 1 })).toThrow(new NormalizeError("Spot.y missing"));
    expect(() => normalizePlanSlot({ kind: "task", task: { type: "heal" }, holder: null, done: false })).toThrow(new NormalizeError("PlanTask.target missing"));
  });
});

describe("normalizeOverrides", () => {
  it("keeps the overrides and drops unknown keys", () => {
    const overrides: ConfigOverrides = {
      mushCount: 1,
      cycleHours: 2,
      setupId: "standard",
      preselection: { seats: 8, endsOn: { day: 1, cycle: 4 }, mushCount: "auto", twoMushAbove: 8, minPlayers: 3 },
    };
    expect(normalizeOverrides({ ...overrides, retired: true } as ConfigOverrides)).toStrictEqual(overrides);
    expect(normalizeOverrides({})).toStrictEqual({});
  });
});

describe("added", () => {
  it("defaults only an undefined field", () => {
    expect(added({ a: undefined as number | null | undefined }, "a", 5)).toBe(5);
    expect(added({ a: null as number | null | undefined }, "a", 5)).toBeNull();
    expect(added({ a: 0 as number | null | undefined }, "a", 5)).toBe(0);
  });
});

it("normalizeState.ts never uses ??, which would replace a stored null", () => {
  const source = readFileSync(new URL("../src/normalizeState.ts", import.meta.url), "utf8");
  expect(source.includes("??")).toBe(false);
});
