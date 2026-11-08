import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfig } from "../src/config.ts";
import { createGame } from "../src/rules.ts";
import { dropQueues } from "../src/queue.ts";
import { fullViewFor, seatStarts, type FullView } from "../src/fullView.ts";
import {
  added,
  NormalizeError,
  normalizeContainer,
  normalizeFullView,
  normalizeGame,
  normalizeHunterTarget,
  normalizeOverrides,
  normalizePlanSlot,
  normalizePlanTask,
  normalizeSpot,
  overridesOf,
  hasQueues,
  STATE_VERSION,
  TooNewError,
  upgrade,
  UPGRADE_STEPS,
  MIN_STATE_VERSION,
  normalizeFrame,
  type UpgradeStep,
} from "../src/normalizeState.ts";
import type { ConfigOverrides, Container, GameState, HunterTarget, PlanSlot, PlanTask, PlayerState, Spot } from "../src/types.ts";
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
    Object.assign(game.items[1]!, { of: b.id, builds: "x", charges: 2, teaches: "y", spores: 1, broken: true, jelly: 3, plant: { species: "fruit_banana", age: null, thirst: 2, sick: true } });
    game.space = [{ id: "d1", type: "metal_scraps", plant: { species: "fruit_banana", age: 1, thirst: 0, sick: false } }];
    game.equipment.BRIDGE = [{ id: "BRIDGE:X", type: "X", broken: true, jelly: 2 }];
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

describe("normalizeFullView", () => {
  /** A frame as storage hands it back: plain JSON. */
  const frame = (game: GameState, starts = true): Raw => JSON.parse(JSON.stringify(fullViewFor(game, starts ? seatStarts(game) : null)));

  for (const [name, make] of [
    ["a fresh 3-seat game", fresh],
    ["a random game a few cycles in", played],
  ] as const) {
    it(`gives back a frame of ${name} as it was, queues included`, () => {
      const { game } = make();
      const raw = frame(game);
      expect(normalizeFullView(raw)).toStrictEqual(frame(game));
    });

    it(`is idempotent on a frame of ${name}`, () => {
      const once = normalizeFullView(frame(make().game));
      expect(normalizeFullView(JSON.parse(JSON.stringify(once)))).toStrictEqual(once);
    });

    it(`shares nothing with its input, for a frame of ${name}`, () => {
      const raw = frame(make().game);
      const input = objectsIn(raw);
      for (const object of objectsIn(normalizeFullView(raw))) expect(input.has(object)).toBe(false);
    });
  }

  it("keeps the action under way and the queue", () => {
    const raw = frame(fresh().game);
    const current = { action: { type: "ready" }, adjustment: { ap: 0, mp: 0 }, since: 1, until: 2 };
    const queue = [{ action: { type: "ready" }, adjustment: { ap: 0, mp: 0 } }];
    Object.assign(raw.players[0], { current, queue });
    const player = normalizeFullView(raw).players[0]!;
    expect(player.current).toEqual(current);
    expect(player.queue).toEqual(queue);
  });

  it("keeps a null starts (pre-selection) and throws on a missing one", () => {
    const raw = frame(fresh().game, false);
    expect(normalizeFullView(raw).starts).toBeNull();
    delete raw.starts;
    expect(() => normalizeFullView(raw)).toThrow("FullView.starts missing");
  });

  it("rebuilds the config from its overrides: this build's numbers, and defaults for fields an old config lacks", () => {
    const raw = frame(fresh().game);
    raw.config.startAp = DEFAULT_CONFIG.startAp + 5; // a balance number changed since the frame was stored
    delete raw.config.dailyHeal; // a field added since
    raw.config.cycleHours = 2; // an override, kept
    raw.config.cyclesPerDay = 12;
    expect(normalizeFullView(raw).config).toStrictEqual(resolveConfig({ ...overridesOf(DEFAULT_CONFIG), cycleHours: 2 }));
  });
});

describe("overridesOf", () => {
  it("reads back the overrides a config was resolved from", () => {
    const overrides: ConfigOverrides = {
      mushCount: 1,
      manualCycles: true,
      cycleHours: 3,
      sharedSpots: false,
      setupId: "classic",
      preselection: { seats: 8, endsOn: { day: 1, cycle: 4 }, mushCount: "auto", twoMushAbove: 8, minPlayers: 4 },
    };
    expect(overridesOf(resolveConfig(overrides))).toStrictEqual(overrides);
    expect(resolveConfig(overridesOf(resolveConfig(overrides)))).toStrictEqual(resolveConfig(overrides));
  });

  it("leaves out a null setup and pre-selection, and the keys an old config lacks", () => {
    expect(DEFAULT_CONFIG.setupId).toBeNull();
    expect(DEFAULT_CONFIG.preselection).toBeNull();
    expect(Object.keys(overridesOf(DEFAULT_CONFIG)).sort()).toEqual(["cycleHours", "manualCycles", "mushCount", "sharedSpots"]);
    expect(overridesOf({ mushCount: 2 })).toStrictEqual({ mushCount: 2 });
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

  // One sample per variant, keyed by its discriminant, so a new variant doesn't compile until it has one here.
  const containers: { [K in Container["kind"]]: Extract<Container, { kind: K }> } = {
    player: { kind: "player", id: "p1" },
    room: { kind: "room", id: "BRIDGE" },
  };
  const spots: { [K in Spot["kind"]]: Extract<Spot, { kind: K }>[] } = {
    cell: [{ kind: "cell", x: 1, y: 2 }, { kind: "cell", x: 0, y: 0, sitting: false }],
    door: [{ kind: "door", door: "BRIDGE" }],
  };
  const targets: { [K in HunterTarget["kind"]]: Extract<HunterTarget, { kind: K }> } = {
    ship: { kind: "ship" },
    patrol: { kind: "patrol", id: "PATROL_SHIP_ALPHA_TAMARIN" },
  };
  const tasks: { [K in PlanTask["type"]]: Extract<PlanTask, { type: K }> } = {
    research: { type: "research", research: "r" },
    project: { type: "project", project: "p" },
    repair_pilgred: { type: "repair_pilgred" },
    heal: { type: "heal", target: "p1" },
    comfort: { type: "comfort", target: "p2" },
    stt: { type: "stt", target: "p3" },
    fiery_speech: { type: "fiery_speech" },
    boring_speech: { type: "boring_speech" },
    bring: { type: "bring", itemType: "medikit" },
  };
  const slots: { [K in PlanSlot["kind"]]: Extract<PlanSlot, { kind: K }>[] } = {
    onCall: [{ kind: "onCall", holder: null }, { kind: "onCall", holder: "p1", reservedFor: "p1", outcome: "arrived" }],
    task: Object.values(tasks).map((task, i) => ({ kind: "task", task, holder: i % 2 ? "p1" : null, done: i % 3 === 0, ...(i === 1 ? { reservedFor: "p2", struck: "already_done" } : {}) }) as const),
  };
  const variants: [string, (raw: any) => unknown, readonly unknown[]][] = [
    ["Container", normalizeContainer, Object.values(containers)],
    ["Spot", normalizeSpot, Object.values(spots).flat()],
    ["HunterTarget", normalizeHunterTarget, Object.values(targets)],
    ["PlanTask", normalizePlanTask, Object.values(tasks)],
    ["PlanSlot", normalizePlanSlot, Object.values(slots).flat()],
  ];

  for (const [type, normalize, samples] of variants) {
    it(`${type}: gives back every variant as it was`, () => {
      for (const sample of samples) expect(normalize(JSON.parse(JSON.stringify(sample)))).toStrictEqual(sample);
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

describe("upgrade", () => {
  /** Steps that note their own version in the order they run, plus `upgradeTo999`, beyond this build. */
  const fakeSteps = (): { steps: UpgradeStep[]; ran: number[] } => {
    const ran: number[] = [];
    const step = (to: number): UpgradeStep => ({ to, run: (game) => { ran.push(to); game[`at${to}`] = true; } });
    return { steps: [step(STATE_VERSION - 2), step(STATE_VERSION - 1), step(STATE_VERSION), step(999)], ran };
  };

  it("runs the steps after the stored version up to this build's, in order, on the snapshot it is given", () => {
    const { steps, ran } = fakeSteps();
    const raw = { game: {} as Raw, overrides: {} };
    upgrade(raw, STATE_VERSION - 2, steps);
    expect(ran).toEqual([STATE_VERSION - 1, STATE_VERSION]);
    expect(raw.game).toEqual({ [`at${STATE_VERSION - 1}`]: true, [`at${STATE_VERSION}`]: true });
  });

  it("runs nothing for a snapshot at this build's version", () => {
    const { steps, ran } = fakeSteps();
    upgrade({ game: {}, overrides: {} }, STATE_VERSION, steps);
    expect(ran).toEqual([]);
  });

  it("refuses a snapshot from a newer build", () => {
    const { steps, ran } = fakeSteps();
    expect(() => upgrade({ game: {}, overrides: {} }, STATE_VERSION + 1, steps)).toThrow(TooNewError);
    expect(ran).toEqual([]);
  });

  it("lists the real steps in order, none beyond this build's version", () => {
    const tos = UPGRADE_STEPS.map((step) => step.to);
    expect(tos).toEqual([...tos].sort((a, b) => a - b));
    expect(new Set(tos).size).toBe(tos.length);
    expect(tos.every((to) => to <= STATE_VERSION)).toBe(true);
    expect(tos.every((to) => to > MIN_STATE_VERSION)).toBe(true);
    expect(MIN_STATE_VERSION).toBeLessThanOrEqual(STATE_VERSION);
  });
});

describe("normalizeFrame (#384)", () => {
  const frame = () => JSON.parse(JSON.stringify(fullViewFor(play(100, 5).state, null))) as FullView;
  /** A step at this build's version that moves the cycle and the Mush count, so its effect shows after normalizing. */
  const moving: UpgradeStep = {
    to: STATE_VERSION,
    run: (game, overrides) => {
      game.cycle = 99;
      overrides.mushCount = 1;
    },
  };

  it("runs the steps the frame still needs on a copy, then normalizes it with the overrides they left", () => {
    const raw = frame();
    const before = JSON.parse(JSON.stringify(raw)) as FullView;
    const read = normalizeFrame(raw, STATE_VERSION - 1, [moving]);
    expect(read.cycle).toBe(99);
    expect(read.config.mushCount).toBe(1);
    expect(raw).toEqual(before);
    expect({ ...read, cycle: raw.cycle, config: raw.config }).toEqual(normalizeFullView(raw));
  });

  it("only normalizes a frame at this build's version, and refuses one from a newer build", () => {
    const raw = frame();
    expect(normalizeFrame(raw, STATE_VERSION, [moving])).toEqual(normalizeFullView(raw));
    expect(() => normalizeFrame(raw, STATE_VERSION + 1)).toThrow(TooNewError);
  });
});

describe("hasQueues", () => {
  it("is false for a fresh game", () => {
    expect(hasQueues(stored(fresh().game))).toBe(false);
    expect(dropQueues(fresh().game)).toEqual({ ok: false, error: "nothing_queued" });
  });

  it("is true with an action under way or queued, and dropQueues then gives what normalizeGame gives (decision 2)", () => {
    const { game, overrides } = played();
    expect(game.players.some((p) => p.current !== null || p.queue.length > 0)).toBe(true);
    expect(hasQueues(stored(game))).toBe(true);
    const result = dropQueues(game);
    if (!result.ok) throw new Error(result.error);
    // The equivalence the server's record relies on.
    expect(stored(result.state)).toStrictEqual(stored(normalizeGame(stored(game), overrides)));
  });
});
