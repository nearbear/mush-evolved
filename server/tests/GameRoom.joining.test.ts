import {
  CHARACTERS,
  CYCLE_HOURS,
  legalIn,
  PRESELECTION,
  setupOverrides,
  STANDARD_SETUP,
  type CharacterId,
  type ConfigOverrides,
  type GameServerMessage,
  type GameSetup,
  type Setup,
} from "@mush2/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeServer, FakeStorage, seats, tokensFor } from "../src/testing/fakes.ts";
import {
  GameRoom,
  type Conn,
  type Room,
  asRoom,
  newRoom,
  connect,
  CHEATS,
  DEV,
  nextCycleAt,
  send,
  lastViewMsg,
  lastView,
  gameOf,
} from "./gameRoomHarness.ts";

// Mocked before the harness imports GameRoom, so the room extends the fake server.
vi.mock("partyserver", () => ({ Server: FakeServer }));

describe("GameRoom cycle clock", () => {
  const launch = Date.UTC(2026, 9, 19, 14, 10); // 14:10 GMT: day 1, cycle 5
  const views = (c: Conn) => c.messages<GameServerMessage>().filter((m) => m.type === "view");

  beforeEach(() => {
    vi.useFakeTimers({ now: launch });
    return () => vi.useRealTimers();
  });

  it("launches on the clock's cycle of the day and sets an alarm for the next one", async () => {
    const { room, storage } = await newRoom(3);
    const c = connect(room, "tok0");
    expect(lastView(c)).toMatchObject({ day: 1, cycleOfDay: 5 });
    expect(storage.alarm).toBe(Date.UTC(2026, 9, 19, 15));
    expect(lastViewMsg(c)).toMatchObject({ type: "view", nextCycleAt: Date.UTC(2026, 9, 19, 15) });
    expect(legalIn(lastView(c)).some((a) => a.type === "ready")).toBe(false);
  });

  it("offers End cycle only where cheats are allowed", async () => {
    const { room } = await newRoom(3, new FakeStorage(), CHEATS);
    expect(legalIn(lastView(connect(room, "tok0")))).toContainEqual({ type: "ready" });
  });

  it("starts the next cycle when the alarm fires at the boundary, and records it", async () => {
    const { room, storage } = await newRoom(3);
    const c = connect(room, "tok0");
    vi.setSystemTime(Date.UTC(2026, 9, 19, 15));
    await room.onAlarm();
    expect(lastView(c)).toMatchObject({ day: 1, cycleOfDay: 6 });
    // The connected seat is reported as seen (#145), then the cycle, at the boundary.
    expect(storage.data.get("input:000000000")).toMatchObject({ input: { type: "seen", players: ["p0"] } });
    expect(storage.data.get("input:000000001")).toMatchObject({ input: { type: "cycle", at: Date.UTC(2026, 9, 19, 15) } });
    expect(storage.alarm).toBe(Date.UTC(2026, 9, 19, 18));
  });

  it("counts a connected player as seen at each cycle change, so only the absent go inactive (#145)", async () => {
    const { room } = await newRoom(3);
    connect(room, "tok0");
    for (let i = 0; i < 12; i++) {
      for (const p of gameOf(room).players) p.ap = gameOf(room).config.maxAp;
      vi.setSystemTime(Date.UTC(2026, 9, 19, 15 + 3 * i));
      await room.onAlarm();
    }
    const [p0, p1] = gameOf(room).players;
    expect([p0!.inactivity, p1!.inactivity]).toEqual([undefined, "inactive"]);
  });

  it("tells nobody else when a player connects, unless that ends their inactivity (#145)", async () => {
    const { room, storage } = await newRoom(3);
    const c0 = connect(room, "tok0");
    vi.setSystemTime(Date.UTC(2026, 9, 19, 15));
    await room.onAlarm();
    const pushed = c0.sent.length;
    const inputs = () => [...storage.data.keys()].filter((k) => k.startsWith("input:")).length;
    const before = inputs();
    // Seen at this cycle change already: connecting again in the same cycle records nothing.
    vi.setSystemTime(Date.UTC(2026, 9, 19, 16));
    connect(room, "tok1");
    // Not seen since an earlier cycle: recorded, but no view is pushed.
    gameOf(room).players[2]!.lastSeenAt = Date.UTC(2026, 9, 19, 14);
    connect(room, "tok2");
    await vi.waitFor(() => expect(inputs()).toBe(before + 1));
    expect(storage.data.get(`input:${String(before).padStart(9, "0")}`)).toMatchObject({ input: { type: "seen", players: ["p2"] } });
    expect(c0.sent.length, "a plain seen pushes no view").toBe(pushed);
    gameOf(room).players[1]!.inactivity = "inactive";
    connect(room, "tok1");
    await vi.waitFor(() => expect(c0.sent.length).toBeGreaterThan(pushed));
  });

  it("catches up on every cycle missed while down, with a day change at midnight GMT", async () => {
    const { storage } = await newRoom(3);
    vi.setSystemTime(Date.UTC(2026, 9, 20, 4)); // five boundaries later: 15, 18, 21, 00, 03
    const revived = asRoom(storage);
    await revived.onStart();
    await revived.onAlarm();
    const c = connect(revived, "tok0");
    expect(lastView(c)).toMatchObject({ day: 2, cycleOfDay: 2 });
    // Five cycles, then connecting reports the seat as seen (inactivity, #145).
    const inputs = [...storage.data.keys()].filter((k) => k.startsWith("input:"));
    expect(inputs).toHaveLength(6);
    expect(storage.data.get(inputs[5]!)).toMatchObject({ input: { type: "seen", players: ["p0"] } });
    expect(storage.alarm).toBe(Date.UTC(2026, 9, 20, 6));
  });

  it("settles an action bar and a boundary in time order", async () => {
    vi.setSystemTime(Date.UTC(2026, 9, 19, 14, 59, 59));
    const { room, storage } = await newRoom(3);
    const c = connect(room, "tok0");
    const move = legalIn(lastView(c)).find((x) => x.type === "move")! as { to: string };
    await send(room, c, { type: "action", action: move });
    vi.setSystemTime(Date.UTC(2026, 9, 19, 15, 0, 5));
    await room.onAlarm();
    const inputs = [...storage.data].filter(([k]) => k.startsWith("input:")).map(([, v]) => (v as { input: { type: string } }).input.type);
    // The connected seat is reported as seen just before the cycle change (#145).
    expect(inputs).toEqual(["action", "seen", "cycle", "tick"]);
    expect(lastView(c)).toMatchObject({ cycleOfDay: 6, you: { room: move.to } });
    expect(views(c).length).toBeGreaterThan(1);
  });

  it("runs short cycles with CYCLE_SECONDS, still aligned to the clock", async () => {
    vi.setSystemTime(90_000);
    const { room, storage } = await newRoom(3, new FakeStorage(), { CYCLE_SECONDS: "60" });
    expect(lastView(connect(room, "tok0"))).toMatchObject({ day: 1, cycleOfDay: 2 }); // the second minute of the "day"
    expect(storage.alarm).toBe(120_000);
  });

  describe("with a setup's cycle length (#230)", () => {
    /** Launches like `setup`, with `cycleHours` in the overrides (#232 will pass a setup's config this way). */
    async function roomWithCycleHours(cycleHours: number, storage = new FakeStorage(), env: Record<string, string> = {}) {
      const room = asRoom(storage, env);
      await (room as unknown as { launch(s: unknown, t: unknown, o: ConfigOverrides): Promise<void> }).launch(seats(3), tokensFor(3), { cycleHours });
      return { room, storage };
    }

    it("launches at 14:10 GMT on the right cycle of day 1, with the next change at the next multiple of the length", async () => {
      for (const h of CYCLE_HOURS) {
        const { room, storage } = await roomWithCycleHours(h);
        const next = Date.UTC(2026, 9, 19, Math.floor(14 / h) * h + h);
        expect(lastView(connect(room, "tok0")), `${h} h`).toMatchObject({ day: 1, cycleOfDay: Math.floor(14 / h) + 1 });
        expect(storage.alarm, `${h} h`).toBe(next);
      }
    });

    it("keeps its length on reload and begins day 2 at midnight GMT", async () => {
      const { storage } = await roomWithCycleHours(6);
      vi.setSystemTime(Date.UTC(2026, 9, 20, 0, 30)); // two boundaries later: 18:00, 00:00
      const revived = asRoom(storage);
      await revived.onStart();
      await revived.onAlarm();
      expect(lastView(connect(revived, "tok0"))).toMatchObject({ day: 2, cycleOfDay: 1 });
      expect(storage.alarm).toBe(Date.UTC(2026, 9, 20, 6));
    });

    it("still gives way to CYCLE_SECONDS", async () => {
      vi.setSystemTime(90_000);
      const { storage } = await roomWithCycleHours(1, new FakeStorage(), { CYCLE_SECONDS: "60" });
      expect(storage.alarm).toBe(120_000);
    });
  });
});

describe("GameRoom joining (pre-selection)", () => {
  const launch = Date.UTC(2026, 9, 19, 14, 10); // 14:10 GMT: day 1, cycle 5

  beforeEach(() => {
    vi.useFakeTimers({ now: launch });
    return () => vi.useRealTimers();
  });

  const joinOk = async (room: Room, name: string, character: CharacterId) => {
    const result = await room.join(name, character);
    if (!result.ok) throw new Error(result.error);
    return result;
  };

  it("launches empty on the first join, seats the player as human, and gives them their own token", async () => {
    const storage = new FakeStorage();
    const room = asRoom(storage);
    const first = await joinOk(room, "Ann", "chao");
    expect(first.aboard).toBe(1);
    const view = lastView(connect(room, first.token));
    expect(view).toMatchObject({ preselection: true, you: { id: "p0", character: "chao", role: "human" } });
    expect((await storage.get<GameSetup>("setup"))!.seats).toEqual([]);
    expect([...(await storage.list({ prefix: "input:" })).values()]).toMatchObject([{ input: { type: "join", seat: { id: "p0", name: "Ann" } } }]);
  });

  it("closes at the start of day 3 cycle 8 on the GMT clock", async () => {
    const room = asRoom(new FakeStorage());
    expect((await joinOk(room, "Ann", "chao")).closesAt).toBe(Date.UTC(2026, 9, 21, 21));
  });

  /** A posted setup with every knob off the standard. */
  const custom: Setup = {
    ...STANDARD_SETUP,
    id: "s1",
    text: { en: { name: "Quick", description: "" } },
    ownerName: "Ann",
    createdAt: 1,
    knobs: { seats: 6, preselectionDays: 2, mushCount: 3, cycleHours: 1, sharedSpots: false },
  };

  it("launches with the first join's setup, and records only its id beside the knobs", async () => {
    const storage = new FakeStorage();
    const room = asRoom(storage);
    const first = await room.join("Ann", "chao", custom);
    if (!first.ok) throw new Error(first.error);
    // 14:10 GMT is cycle 15 of 24 with 1-hour cycles: day 2's last cycle starts at 23:00 the next day.
    expect(first).toMatchObject({ seats: 6, closesAt: Date.UTC(2026, 9, 20, 23), setupId: "s1" });
    expect(room.status().setupId).toBe("s1");
    const config = gameOf(room).config;
    expect(config).toMatchObject({ setupId: "s1", cycleHours: 1, cyclesPerDay: 24, sharedSpots: false });
    expect(config.preselection).toMatchObject({ seats: 6, mushCount: 3, endsOn: { day: 2, cycle: 24 } });
    const recorded = (await storage.get<GameSetup>("setup"))!;
    expect(recorded.overrides).toEqual({ ...setupOverrides(custom.knobs), setupId: "s1" });
    // Nothing of the setup but its id: the name and author are looked up (#237).
    expect(JSON.stringify(recorded)).not.toContain("Quick");
    expect(lastView(connect(room, first.token)).config.setupId).toBe("s1");
  });

  it("keeps the setup it launched with when a later join brings another", async () => {
    const room = asRoom(new FakeStorage());
    await joinOk(room, "Ann", "chao");
    const second = await room.join("Bob", "chun", custom);
    expect(second).toMatchObject({ ok: true, seats: PRESELECTION.seats, setupId: "standard" });
    expect(gameOf(room).config).toMatchObject({ setupId: "standard", cycleHours: 3, sharedSpots: true });
  });

  it("launches with the standard setup when the one it's given doesn't validate", async () => {
    const room = asRoom(new FakeStorage());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = { ...custom, knobs: { ...custom.knobs, seats: 40 } };
    // The matchmaker is told the setup it really has (#236).
    expect(await room.join("Ann", "chao", bad)).toMatchObject({ ok: true, seats: PRESELECTION.seats, setupId: "standard" });
    expect(gameOf(room).config).toMatchObject({ setupId: "standard", cycleHours: 3, sharedSpots: true });
    // Claiming the standard id doesn't bring other knobs along.
    const impostor = asRoom(new FakeStorage());
    await impostor.join("Ann", "chao", { ...custom, id: "standard" });
    expect(gameOf(impostor).config).toMatchObject({ setupId: "standard", cycleHours: 3, sharedSpots: true });
    expect(gameOf(impostor).config.preselection?.seats).toBe(PRESELECTION.seats);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("refuses a taken character without seating anyone, and seats a free one", async () => {
    const room = asRoom(new FakeStorage());
    const first = await joinOk(room, "Ann", "chao");
    expect(await room.join("Bob", "chao")).toEqual({ ok: false, error: "character_taken" });
    const second = await joinOk(room, "Bob", "chun");
    expect(second.aboard).toBe(2);
    const others = lastView(connect(room, first.token)).players;
    expect(others.map((o) => o.character)).toEqual(["chun"]);
  });

  it("picks the Mush when the ship fills, then takes no more crew", async () => {
    const room = asRoom(new FakeStorage());
    // A ship has `PRESELECTION.seats` (16): one per character.
    const characters: CharacterId[] = CHARACTERS.map((c) => c.id);
    expect(characters).toHaveLength(PRESELECTION.seats);
    const joined = [];
    for (const [i, c] of characters.entries()) joined.push(await joinOk(room, `P${i}`, c));
    expect(joined.every((j) => j.seats === PRESELECTION.seats)).toBe(true);
    expect(joined.at(-1)!.closesAt).toBeNull();
    expect(joined.slice(0, -1).every((j) => j.closesAt !== null)).toBe(true);
    const views = joined.map((j) => lastView(connect(room, j.token)));
    expect(views.every((v) => !v.preselection)).toBe(true);
    expect(views.filter((v) => v.you.role === "mush")).toHaveLength(2);
    expect(await room.join("Late", "frieda")).toEqual({ ok: false, error: "ship_closed" });
  });

  it("fills a dev server's ship with a parrot bot per free character after a delay, and picks the Mush", async () => {
    vi.useFakeTimers();
    try {
      const room = asRoom(new FakeStorage(), DEV);
      const first = await joinOk(room, "Ann", "chao");
      expect(first.closesAt).not.toBeNull();
      // A second window joins during the delay.
      const second = await joinOk(room, "Bea", "chun");
      await vi.advanceTimersByTimeAsync(10_000);
      const view = lastView(connect(room, first.token));
      expect(view.preselection).toBe(false);
      expect(view.players).toHaveLength(CHARACTERS.length - 1);
      expect(view.players.filter((p) => p.isBot)).toHaveLength(CHARACTERS.length - 2);
      expect(view.players.every((p) => !p.isBot || p.botKind === "logParrot")).toBe(true);
      expect(new Set([...view.players.map((p) => p.character), "chao"]).size).toBe(CHARACTERS.length);
      expect(lastView(connect(room, second.token)).preselection).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fills a dev server's smaller ship only up to its own seat count", async () => {
    vi.useFakeTimers();
    try {
      const room = asRoom(new FakeStorage(), DEV);
      const first = await room.join("Ann", "chao", custom);
      if (!first.ok) throw new Error(first.error);
      expect(first.seats).toBe(6);
      await vi.advanceTimersByTimeAsync(10_000);
      const view = lastView(connect(room, first.token));
      expect([view.preselection, view.players.length + 1]).toEqual([false, 6]);
      expect(room.status()).toMatchObject({ aboard: 6, seats: 6, closesAt: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it("never seats bots on a deployment, even the test one with cheats on", async () => {
    vi.useFakeTimers();
    try {
      for (const env of [{}, CHEATS]) {
        const room = asRoom(new FakeStorage(), env);
        const first = await joinOk(room, "Ann", "chao");
        await vi.advanceTimersByTimeAsync(10_000);
        expect(lastView(connect(room, first.token)).players).toEqual([]);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
