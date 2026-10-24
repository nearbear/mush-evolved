import { CHARACTERS, CHAT_CHANNELS, legalIn, type CharacterId, type GameServerMessage, type GameSetup, type PlayerView } from "@mush2/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeConnection, FakeServer, FakeStorage, seats, tokensFor } from "../src/testing/fakes.ts";

vi.mock("partyserver", () => ({ Server: FakeServer }));
const { GameRoom } = await import("../src/GameRoom.ts");

type Conn = FakeConnection<{ playerId: string }>;
type Room = InstanceType<typeof GameRoom>;

// The room is a Durable Object; these tests drive it through the same
// methods the runtime calls (setup, onConnect, onMessage) with fake sockets.
const asRoom = (storage: FakeStorage, env: Record<string, string> = {}): Room =>
  new GameRoom({ storage } as never, { RULES_VERSION: "test", ...env } as never);

async function newRoom(humans = 3, storage = new FakeStorage(), env: Record<string, string> = {}) {
  const room = asRoom(storage, env);
  await room.setup(seats(humans), tokensFor(humans));
  return { room, storage };
}

function connect(room: Room, token: string | null, id = `c-${token}`): Conn {
  const conn: Conn = new FakeConnection(id);
  (room as unknown as FakeServer).connections.add(conn as never);
  const url = `http://x/parties/game-room/r${token ? `?token=${token}` : ""}`;
  room.onConnect(conn as never, { request: new Request(url) } as never);
  return conn;
}

/** End cycle (`ready`) is offered only where cheats are allowed. */
const CHEATS = { ALLOW_CHEATS: "true" };
const HOUR = 60 * 60 * 1000;
/** When the next 3-hour cycle begins after `at`. */
const nextCycleAt = (at: number) => (Math.floor(at / (3 * HOUR)) + 1) * 3 * HOUR;

const send = (room: Room, conn: Conn, msg: unknown) => room.onMessage(conn as never, typeof msg === "string" ? msg : JSON.stringify(msg));
const lastMsg = (c: Conn) => c.messages<GameServerMessage>().at(-1)!;
const lastView = (c: Conn): PlayerView => {
  const views = c.messages<GameServerMessage>().filter((m) => m.type === "view");
  return (views.at(-1) as { view: PlayerView }).view;
};

describe("GameRoom connections and seat tokens", () => {
  it("rejects a missing token with close code 4001 and sends nothing", async () => {
    const { room } = await newRoom();
    const c = connect(room, null);
    expect(c.closed?.code).toBe(4001);
    expect(c.sent).toEqual([]);
  });

  it("rejects an unknown token", async () => {
    const { room } = await newRoom();
    const c = connect(room, "guess");
    expect(c.closed?.code).toBe(4001);
    expect(c.sent).toEqual([]);
  });

  it("rejects everyone before the game is set up", async () => {
    const room = asRoom(new FakeStorage());
    expect(connect(room, "tok0").closed?.code).toBe(4001);
  });

  it("gives each token exactly its own seat's view", async () => {
    const { room } = await newRoom(3);
    for (const i of [0, 1, 2]) expect(lastView(connect(room, `tok${i}`)).you.id).toBe(`p${i}`);
  });

  it("refuses to be set up twice", async () => {
    const { room } = await newRoom();
    await expect(room.setup(seats(3), tokensFor(3))).rejects.toThrow("already set up");
  });
});

describe("GameRoom views never leak", () => {
  it("sends other seats as OtherPlayerView only, and never the RNG state", async () => {
    const { room } = await newRoom(3);
    const c = connect(room, "tok0");
    const payload = JSON.parse(c.sent[0]!);
    const view = payload.view;
    expect(JSON.stringify(payload)).not.toContain('"rng"');
    expect(view.players.length).toBeGreaterThan(0);
    for (const other of view.players) {
      for (const secret of ["role", "alpha", "hp", "morale", "ap", "mp", "modifiers", "inventory"]) {
        expect(other).not.toHaveProperty(secret);
      }
    }
  });

  it("broadcasts a change to every connection, each with its own seat's view", async () => {
    const { room } = await newRoom(3);
    const a = connect(room, "tok0");
    const b = connect(room, "tok1");
    const move = legalIn(lastView(a)).find((x) => x.type === "move")!;
    await send(room, a, { type: "action", action: move });
    await room.onAlarm(); // the move's bar runs out
    expect(lastView(a).you.id).toBe("p0");
    expect(lastView(b).you.id).toBe("p1");
    expect(lastView(a).you.room).not.toBe(lastView(b).you.room);
  });
});

describe("GameRoom input handling", () => {
  it("replies 'Malformed message' to garbage and non-string frames", async () => {
    const { room } = await newRoom();
    const c = connect(room, "tok0");
    await send(room, c, "not json");
    expect(lastMsg(c)).toEqual({ type: "error", message: "malformed_message" });
    await send(room, c, { type: "action", action: { type: "launchMissiles" } });
    expect(lastMsg(c)).toEqual({ type: "error", message: "malformed_message" });
    await room.onMessage(c as never, new ArrayBuffer(4));
    expect(lastMsg(c)).toEqual({ type: "error", message: "malformed_message" });
  });

  it("acts as the authenticated seat, ignoring any 'by' the client claims", async () => {
    const { room, storage } = await newRoom(3);
    const a = connect(room, "tok0");
    const b = connect(room, "tok1");
    const move = legalIn(lastView(a)).find((x) => x.type === "move")!;
    const before = lastView(b).you.room;
    await send(room, a, { type: "action", by: "p1", action: move });
    await room.onAlarm();
    expect(lastView(b).you.room).toBe(before);
    expect(lastView(a).you.room).toBe((move as { to: string }).to);
    expect(storage.data.get("input:000000000")).toMatchObject({ input: { by: "p0" } });
  });

  it("answers an illegal action with a generic error and leaves the game alone", async () => {
    const { room, storage } = await newRoom();
    const c = connect(room, "tok0");
    const before = c.sent.length;
    await send(room, c, { type: "action", action: { type: "move", to: "no-such-room" } });
    expect(lastMsg(c).type).toBe("error");
    expect(c.sent.length).toBe(before + 1);
    expect([...storage.data.keys()].some((k) => k.startsWith("input:"))).toBe(false);
  });

  it("rate limits a connection and counts the rejections per seat", async () => {
    const { room, storage } = await newRoom();
    const c = connect(room, "tok0");
    for (let i = 0; i < 15; i++) await send(room, c, "x");
    const errors = c.messages<GameServerMessage>().filter((m) => m.type === "error");
    expect(errors.filter((e) => (e as { message: string }).message === "slow_down")).toHaveLength(5);
    // The counter is saved with the next accepted change.
    const move = legalIn(lastView(c)).find((x) => x.type === "move")!;
    room.onClose(c as never);
    const c2 = connect(room, "tok0", "fresh-connection");
    await send(room, c2, { type: "action", action: move });
    expect((storage.data.get("game") as { rateLimited: Record<string, number> }).rateLimited).toEqual({ p0: 5 });
  });

  it("forgets a connection's rate limit when it closes", async () => {
    const { room } = await newRoom();
    const c = connect(room, "tok0", "same-id");
    for (let i = 0; i < 10; i++) await send(room, c, "x");
    room.onClose(c as never);
    await send(room, c, "x");
    expect(lastMsg(c)).toEqual({ type: "error", message: "malformed_message" });
  });
});

describe("GameRoom cheats", () => {
  const cheatMsg = { type: "cheat", cheat: "infiniteHp", on: true };

  it("refuses cheat inputs unless ALLOW_CHEATS is set, and records nothing", async () => {
    const { room, storage } = await newRoom(3);
    const c = connect(room, "tok0");
    await send(room, c, cheatMsg);
    expect(lastMsg(c)).toEqual({ type: "error", message: "cheats_disabled" });
    expect(lastView(c).you.cheats).toEqual([]);
    expect([...storage.data.keys()].some((k) => k.startsWith("input:"))).toBe(false);
  });

  it("gates the ACTOPI cheat the same way", async () => {
    const msg = { type: "actopiCheat", mode: "off" };
    const closed = (await newRoom(3)).room;
    const off = connect(closed, "tok0");
    await send(closed, off, msg);
    expect(lastMsg(off)).toEqual({ type: "error", message: "cheats_disabled" });
    expect(lastView(off).you.actopiCheat).toBe("default");
    const { room } = await newRoom(3, new FakeStorage(), { ALLOW_CHEATS: "true" });
    const on = connect(room, "tok0");
    await send(room, on, msg);
    expect(lastView(on).you.actopiCheat).toBe("off");
  });

  it("tells the client whether cheats are allowed", async () => {
    const off = connect((await newRoom(3)).room, "tok0");
    const on = connect((await newRoom(3, new FakeStorage(), { ALLOW_CHEATS: "true" })).room, "tok0");
    expect((off.messages<{ cheatsAllowed: boolean }>()[0])!.cheatsAllowed).toBe(false);
    expect((on.messages<{ cheatsAllowed: boolean }>()[0])!.cheatsAllowed).toBe(true);
  });

  it("applies them for the sender only when allowed, and keeps them out of other views", async () => {
    const { room } = await newRoom(3, new FakeStorage(), { ALLOW_CHEATS: "true" });
    const [a, b] = [connect(room, "tok0"), connect(room, "tok1")];
    await send(room, a, cheatMsg);
    expect(lastView(a).you.cheats).toEqual(["infiniteHp"]);
    expect(lastView(b).you.cheats).toEqual([]);
    expect(JSON.stringify(lastView(b))).not.toContain("infiniteHp");
  });
});

describe("GameRoom chat", () => {
  const channel = CHAT_CHANNELS[0]!;

  it("refuses blocked text, stores it for moderators only, and never records it as game input", async () => {
    const { room, storage } = await newRoom();
    const a = connect(room, "tok0");
    await send(room, a, { type: "chat", channel, text: "   " });
    expect(lastMsg(a)).toEqual({ type: "error", message: "empty_message" });
    const blocked = [...storage.data].filter(([k]) => k.startsWith("blocked:"));
    expect(blocked).toHaveLength(1);
    expect(blocked[0]![1]).toMatchObject({ by: "p0", type: "chat" });
    expect([...storage.data.keys()].some((k) => k.startsWith("input:"))).toBe(false);
  });

  it("strips links before anyone sees them, keeping the raw text for moderators only", async () => {
    const { room, storage } = await newRoom();
    const a = connect(room, "tok0");
    const b = connect(room, "tok1");
    await send(room, a, { type: "chat", channel, text: "visit https://evil.example now" });
    for (const c of [a, b]) expect(JSON.stringify(c.sent)).not.toContain("evil.example");
    expect(storage.data.get("input:000000000")).toMatchObject({ raw: "visit https://evil.example now" });
  });

  it("limits chat per seat across reconnects", async () => {
    const { room } = await newRoom();
    let errors = 0;
    for (let i = 0; i < 7; i++) {
      const c = connect(room, "tok0", `conn-${i}`); // a new connection each time
      await send(room, c, { type: "chat", channel, text: "hello" });
      if (lastMsg(c).type === "error") errors++;
    }
    expect(errors).toBeGreaterThanOrEqual(2);
  });
});

describe("GameRoom timed actions", () => {
  it("stamps an action with the server's time, sets an alarm for its end, and does it when the alarm fires", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      const { room, storage } = await newRoom(3);
      const c = connect(room, "tok0");
      const move = legalIn(lastView(c)).find((x) => x.type === "move")! as { to: string };
      const from = lastView(c).you.room;
      await send(room, c, { type: "action", action: move, at: 5 });
      expect(storage.data.get("input:000000000")).toMatchObject({ input: { type: "action", at: 1_000_000 } });
      expect(lastView(c).you.current).toMatchObject({ since: 1_000_000, until: 1_001_500 });
      expect(lastView(c).you.room).toBe(from);
      expect(storage.alarm).toBe(1_001_500);
      expect(lastMsg(c)).toMatchObject({ now: 1_000_000 });

      vi.setSystemTime(1_001_500);
      await room.onAlarm();
      expect(storage.data.get("input:000000001")).toMatchObject({ input: { type: "tick", at: 1_001_500 } });
      expect(lastView(c).you.room).toBe(move.to);
      expect(storage.alarm).toBe(3 * HOUR); // the next cycle
    } finally {
      vi.useRealTimers();
    }
  });

  it("Clear queue cancels the action under way and the alarm, outside the chat rate limit", async () => {
    const { room, storage } = await newRoom(3);
    const c = connect(room, "tok0");
    const move = legalIn(lastView(c)).find((x) => x.type === "move")!;
    for (let i = 0; i < 3; i++) {
      await send(room, c, { type: "action", action: move });
      await send(room, c, { type: "clearQueue" });
    }
    expect(lastView(c).you.current).toBeNull();
    expect(storage.alarm).toBe(nextCycleAt(Date.now()));
    expect(c.messages<GameServerMessage>().some((m) => m.type === "error")).toBe(false);
  });
});

describe("GameRoom persistence", () => {
  it("records each accepted input in order, beside the setup", async () => {
    const { room, storage } = await newRoom(3, new FakeStorage(), CHEATS);
    const c = connect(room, "tok0");
    await send(room, c, { type: "action", action: legalIn(lastView(c)).find((x) => x.type === "move")! });
    await send(room, c, { type: "action", action: { type: "ready" } });
    expect(storage.data.has("setup")).toBe(true);
    expect([...storage.data.keys()].filter((k) => k.startsWith("input:"))).toEqual(["input:000000000", "input:000000001"]);
  });

  it("restores the game, tokens and input count after a restart", async () => {
    const { room, storage } = await newRoom(3, new FakeStorage(), CHEATS);
    const c = connect(room, "tok0");
    const move = legalIn(lastView(c)).find((x) => x.type === "move")! as { to: string };
    await send(room, c, { type: "action", action: move });

    // Evicted with the move under way: the stored alarm brings it back and finishes it.
    const revived = asRoom(storage, CHEATS);
    await revived.onStart();
    expect(storage.alarm).not.toBeNull();
    await revived.onAlarm();
    const c2 = connect(revived, "tok0");
    expect(lastView(c2).you.room).toBe(move.to);
    await send(revived, c2, { type: "action", action: { type: "ready" } });
    expect(storage.data.has("input:000000002")).toBe(true); // continued after the move and its tick, didn't overwrite them
  });

  it("discards a game stored under another state version", async () => {
    const { storage } = await newRoom();
    const stored = storage.data.get("game") as { version: number };
    stored.version = -1;
    const revived = asRoom(storage);
    await revived.onStart();
    expect(storage.data.size).toBe(0);
    expect(connect(revived, "tok0").closed?.code).toBe(4001);
  });
});

describe("GameRoom bots", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("plays bot seats after a delay, and only legal actions", async () => {
    // Seats p1..p7 are bots that only end their cycle, so End cycle is on.
    const { room, storage } = await newRoom(1, new FakeStorage(), CHEATS);
    const human = connect(room, "tok0");
    expect([...storage.data.keys()].filter((k) => k.startsWith("input:"))).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1600);
    const inputs = [...storage.data].filter(([k]) => k.startsWith("input:")).map(([, v]) => v as { input: { by: string } });
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((i) => i.input.by !== "p0")).toBe(true);
    expect(lastView(human).players.filter((p) => p.isBot)).toHaveLength(7);
    vi.useRealTimers();
  });

  describe("model bots", () => {
    const MODEL = { MODEL_BASE_URL: "https://example.test/v1", MODEL_NAME: "m", MODEL_API_KEY: "dev-key" };
    /** One human, then three model bots (p1..p3); the rest are log parrots. */
    async function modelRoom(env: Record<string, string>) {
      const storage = new FakeStorage();
      const room = asRoom(storage, env);
      const s = seats(1).map((seat, i) => (i >= 1 && i <= 3 ? { ...seat, botKind: "model" as const } : seat));
      await room.setup(s, tokensFor(1));
      return { room, storage };
    }
    const reply = () => new Response(JSON.stringify({ choices: [{ message: { content: "ACTION: 1" } }] }));

    it("ask the dev model, play its choices, and keep count of the calls", async () => {
      const fetch = vi.fn(async () => reply());
      vi.stubGlobal("fetch", fetch);
      const { storage } = await modelRoom({ ...CHEATS, ...MODEL });
      await vi.advanceTimersByTimeAsync(1600);
      expect(fetch).toHaveBeenCalled();
      const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://example.test/v1/chat/completions");
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer dev-key");
      const inputs = [...storage.data].filter(([k]) => k.startsWith("input:")).map(([, v]) => v as { input: { by: string } });
      expect(inputs.some((i) => ["p1", "p2", "p3"].includes(i.input.by))).toBe(true);
      expect((storage.data.get("game") as { modelCalls: number }).modelCalls).toBe(fetch.mock.calls.length);
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    it("never use model credentials where cheats aren't allowed (there is no hosted default)", async () => {
      const fetch = vi.fn(async () => reply());
      vi.stubGlobal("fetch", fetch);
      await modelRoom(MODEL);
      await vi.advanceTimersByTimeAsync(1600);
      expect(fetch).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    it("aren't asked again while a decision is still waiting on the model", async () => {
      const fetch = vi.fn(() => new Promise<Response>(() => {}));
      vi.stubGlobal("fetch", fetch);
      const storage = new FakeStorage();
      const room = asRoom(storage, { ...CHEATS, ...MODEL });
      await room.setup(seats(1).map((seat, i) => (i === 1 ? { ...seat, botKind: "model" as const } : seat)), tokensFor(1));
      await vi.advanceTimersByTimeAsync(1600);
      // The log parrots ended their cycles meanwhile, and each of those rescheduled the bots.
      expect([...storage.data.keys()].filter((k) => k.startsWith("input:")).length).toBeGreaterThan(0);
      expect(fetch).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    it("don't stall the game when the model fails: they play scripted", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
      const { storage } = await modelRoom({ ...CHEATS, ...MODEL });
      await vi.advanceTimersByTimeAsync(1600);
      const inputs = [...storage.data].filter(([k]) => k.startsWith("input:")).map(([, v]) => v as { input: { by: string } });
      expect(["p1", "p2", "p3"].every((id) => inputs.some((i) => i.input.by === id))).toBe(true);
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });
  });
});

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
    expect(lastMsg(c)).toMatchObject({ type: "view", nextCycleAt: Date.UTC(2026, 9, 19, 15) });
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
    expect(storage.data.get("input:000000000")).toMatchObject({ input: { type: "cycle" } });
    expect(storage.alarm).toBe(Date.UTC(2026, 9, 19, 18));
  });

  it("catches up on every cycle missed while down, with a day change at midnight GMT", async () => {
    const { storage } = await newRoom(3);
    vi.setSystemTime(Date.UTC(2026, 9, 20, 4)); // five boundaries later: 15, 18, 21, 00, 03
    const revived = asRoom(storage);
    await revived.onStart();
    await revived.onAlarm();
    const c = connect(revived, "tok0");
    expect(lastView(c)).toMatchObject({ day: 2, cycleOfDay: 2 });
    expect([...storage.data.keys()].filter((k) => k.startsWith("input:"))).toHaveLength(5);
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
    expect(inputs).toEqual(["action", "cycle", "tick"]);
    expect(lastView(c)).toMatchObject({ cycleOfDay: 6, you: { room: move.to } });
    expect(views(c).length).toBeGreaterThan(1);
  });

  it("runs short cycles with CYCLE_SECONDS, still aligned to the clock", async () => {
    vi.setSystemTime(90_000);
    const { room, storage } = await newRoom(3, new FakeStorage(), { CYCLE_SECONDS: "60" });
    expect(lastView(connect(room, "tok0"))).toMatchObject({ day: 1, cycleOfDay: 2 }); // the second minute of the "day"
    expect(storage.alarm).toBe(120_000);
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
    const characters: CharacterId[] = ["chao", "chun", "eleesha", "finola"];
    const joined = [];
    for (const [i, c] of characters.entries()) joined.push(await joinOk(room, `P${i}`, c));
    expect(joined.at(-1)!.closesAt).toBeNull();
    expect(joined.slice(0, -1).every((j) => j.closesAt !== null)).toBe(true);
    const views = joined.map((j) => lastView(connect(room, j.token)));
    expect(views.every((v) => !v.preselection)).toBe(true);
    expect(views.filter((v) => v.you.role === "mush")).toHaveLength(1);
    expect(await room.join("Late", "frieda")).toEqual({ ok: false, error: "ship_closed" });
  });

  it("fills a dev server's ship with a parrot bot per other character, and picks the Mush", async () => {
    const room = asRoom(new FakeStorage(), CHEATS);
    const first = await joinOk(room, "Ann", "chao");
    expect(first.aboard).toBe(CHARACTERS.length);
    expect(first.closesAt).toBeNull();
    const view = lastView(connect(room, first.token));
    expect(view.preselection).toBe(false);
    expect(view.players).toHaveLength(CHARACTERS.length - 1);
    expect(view.players.every((p) => p.isBot && p.botKind === "logParrot")).toBe(true);
    expect(new Set([...view.players.map((p) => p.character), "chao"]).size).toBe(CHARACTERS.length);
  });

  it("never seats bots on a deployment", async () => {
    const room = asRoom(new FakeStorage());
    const first = await joinOk(room, "Ann", "chao");
    expect(lastView(connect(room, first.token)).players).toEqual([]);
  });
});
