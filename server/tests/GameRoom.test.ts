import {
  characterName,
  CHARACTERS,
  CHAT_CHANNELS,
  MUSH_CHANNEL,
  STATE_VERSION,
  CHAT_PAGE,
  chatPageKey,
  type ChannelId,
  type ChatMessage,
  CYCLE_HOURS,
  DEFAULT_CONFIG,
  fullViewFor,
  HISTORY_VERSION,
  legalIn,
  PRESELECTION,
  rebuildGame,
  rebuildHistory,
  replayKeys,
  resolveConfig,
  setupOverrides,
  STANDARD_KNOBS,
  STANDARD_SETUP,
  type CharacterId,
  type ConfigOverrides,
  type GameServerMessage,
  type GameState,
  type GameSetup,
  type ChunkEntry,
  type FullView,
  type ReplayIndex,
  type PlayerView,
  type RecordedInput,
  type Role,
  type SeatStarts,
  type Setup,
} from "@mush2/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore } from "../src/accountStore.ts";
import { BOT_CHAT_CHAIN_DEPTH } from "../src/bots.ts";
import { GameStore } from "../src/gameStore.ts";
import { FakeConnection, FakeR2Bucket, FakeServer, FakeStorage, seats, tokensFor } from "../src/testing/fakes.ts";
import { migratedDatabase } from "./sqliteD1.ts";

vi.mock("partyserver", () => ({ Server: FakeServer }));
const { GameRoom } = await import("../src/GameRoom.ts");

type Conn = FakeConnection<{ playerId: string }>;
type Room = InstanceType<typeof GameRoom>;

// The room is a Durable Object; these tests drive it through the same
// methods the runtime calls (setup, onConnect, onMessage) with fake sockets.
const asRoom = (storage: FakeStorage, env: Record<string, string> = {}): Room =>
  new GameRoom({ storage } as never, { RULES_VERSION: "test", ...env } as never);

async function newRoom(humans = 3, storage = new FakeStorage(), env: Record<string, string> = {}, roles?: Record<string, Role>) {
  const room = asRoom(storage, env);
  await room.setup(seats(humans), tokensFor(humans), roles);
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
/** A local dev server: bot fill, looser rate limits and the dev model key. */
const DEV = { ...CHEATS, DEV_SERVER: "true" };
const HOUR = 60 * 60 * 1000;

/**
 * The record's history rebuilds the `fullViewFor` of the record's own rebuild after every input, and before each that
 * carries a copy. A restart's `dropQueues` (#384) carries the view as loaded, its actions already dropped: the view
 * after it.
 */
function expectHistory(setup: GameSetup, record: readonly RecordedInput[], starts: SeatStarts): void {
  const json = <T>(v: unknown) => JSON.parse(JSON.stringify(v)) as T;
  const frames = rebuildHistory(record.map((r) => r.history!));
  expect(frames).toHaveLength(record.length);
  frames.forEach(({ base, view }, i) => {
    expect(view, `after input ${i} (${record[i]!.input.type})`).toEqual(json(fullViewFor(rebuildGame(setup, record.slice(0, i + 1)), starts)));
    const loaded = record[i]!.input.type === "dropQueues" ? i + 1 : i;
    if (base) expect(base, `before input ${i}`).toEqual(json(fullViewFor(rebuildGame(setup, record.slice(0, loaded)), starts)));
  });
}
/** When the next 3-hour cycle begins after `at`. */
const nextCycleAt = (at: number) => (Math.floor(at / (3 * HOUR)) + 1) * 3 * HOUR;

/** A chat router reply (#341) naming every bot the router prompt says it may wake. */
const wakeAll = (prompt: string): string => {
  const names = prompt.split("\n").flatMap((l) => l.match(/^- (.+?)(?: \(.*\))?: AI, can wake$/)?.[1] ?? []);
  return `WAKE: ${names.join(", ") || "nobody"}`;
};

const send = (room: Room, conn: Conn, msg: unknown) => room.onMessage(conn as never, typeof msg === "string" ? msg : JSON.stringify(msg));
const lastMsg = (c: Conn) => c.messages<GameServerMessage>().at(-1)!;
/** The last view message, which a `chatRead` may follow (#400). */
const lastViewMsg = (c: Conn) => c.messages<GameServerMessage>().filter((m) => m.type === "view").at(-1)!;
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
    // The counter is saved with the next accepted change, anyone's.
    const c2 = connect(room, "tok1");
    const move = legalIn(lastView(c2)).find((x) => x.type === "move")!;
    await send(room, c2, { type: "action", action: move });
    expect((storage.data.get("game") as { rateLimited: Record<string, number> }).rateLimited).toEqual({ p0: 5 });
  });

  it("loosens the rate limit only on a local dev server, not where cheats alone are on", async () => {
    const slowDowns = async (env: Record<string, string>) => {
      const { room } = await newRoom(3, new FakeStorage(), env);
      const c = connect(room, "tok0");
      for (let i = 0; i < 15; i++) await send(room, c, "x");
      return c.messages<GameServerMessage>().filter((m) => m.type === "error" && m.message === "slow_down").length;
    };
    expect(await slowDowns(CHEATS)).toBe(5);
    expect(await slowDowns(DEV)).toBe(0);
  });

  it("rate limits per seat, so reconnecting or a second device doesn't reset or double it (#285)", async () => {
    const { room } = await newRoom();
    const c = connect(room, "tok0", "same-id");
    for (let i = 0; i < 10; i++) await send(room, c, "x");
    room.onClose(c as never);
    const phone = connect(room, "tok0", "phone");
    await send(room, phone, "x");
    expect(lastMsg(phone)).toEqual({ type: "error", message: "slow_down" });
    // Another seat has its own.
    const other = connect(room, "tok1");
    await send(room, other, "x");
    expect(lastMsg(other)).toEqual({ type: "error", message: "malformed_message" });
  });
});

describe("GameRoom cheats", () => {
  const cheatMsg = { type: "cheat", cheat: "infiniteHp", on: true };

  it("gates Self Disease on ALLOW_CHEATS and applies it privately when enabled", async () => {
    const { room: closed, storage } = await newRoom(3);
    const closedConn = connect(closed, "tok0");
    await send(closed, closedConn, { type: "action", action: { type: "self_disease" } });
    expect(lastMsg(closedConn)).toEqual({ type: "error", message: "cheats_disabled" });
    expect(lastView(closedConn).statuses).not.toContain("cold_disease");
    expect([...storage.data.keys()].some((key) => key.startsWith("input:"))).toBe(false);

    // addDisease skips a Mush, and roles are random: force p0 human.
    const { room: devRoom } = await newRoom(3, new FakeStorage(), CHEATS, { p0: "human" });
    const devConn = connect(devRoom, "tok0");
    await send(devRoom, devConn, { type: "cheat", cheat: "selfDisease", on: true });
    expect(lastView(devConn).you.cheats).toContain("selfDisease");
    expect(lastView(devConn).actions.some((option) => option.action.type === "self_disease")).toBe(true);
    await send(devRoom, devConn, { type: "action", action: { type: "self_disease" } });
    // The disease is drawn at random from allDiseases (owner, 2026-10-27).
    const got = lastView(devConn).statuses.filter((status) => DEFAULT_CONFIG.diseases.allDiseases.includes(status));
    expect(got).toHaveLength(1);
    expect(lastView(connect(devRoom, "tok1")).players.find((person) => person.id === "p0")?.statuses).not.toContain(got[0]);
  });

  it("refuses cheat inputs unless ALLOW_CHEATS is set, and records nothing", async () => {
    const { room, storage } = await newRoom(3);
    const c = connect(room, "tok0");
    await send(room, c, cheatMsg);
    expect(lastMsg(c)).toEqual({ type: "error", message: "cheats_disabled" });
    expect(lastView(c).you.cheats).toEqual([]);
    expect([...storage.data.keys()].some((k) => k.startsWith("input:"))).toBe(false);
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

describe("GameRoom after a Transfer", () => {
  it("moves each seat token to its new body, and the victim acknowledges the pop-up", async () => {
    // p0 (a human seat) is the Mush; p1 the victim.
    const { room } = await newRoom(3, new FakeStorage(), {}, { p0: "mush", p1: "human" });
    const game = (room as unknown as { game: import("@mush2/shared").GameState }).game;
    const [mush, victim] = [game.players[0]!, game.players[1]!];
    mush.mushSkills.push("transfert");
    mush.room = victim.room = "LABORATORY";
    for (const o of game.players.slice(2)) o.room = "REFECTORY";
    game.contamination[victim.id] = 1;
    const victimConn = connect(room, "tok1");
    const mushConn = connect(room, "tok0");
    await send(room, mushConn, { type: "action", action: { type: "body_transfer", target: victim.id } });
    expect(lastView(mushConn).you.id).toBe(victim.id);
    expect(lastView(victimConn).you.id).toBe(mush.id);
    expect(lastView(victimConn).you.bodyTakenBy).toBe(mush.character);
    // A reconnect with the same token lands in the new body.
    expect(lastView(connect(room, "tok1", "c-again")).you.id).toBe(mush.id);
    await send(room, victimConn, { type: "acknowledgeTransfer" });
    expect(lastView(victimConn).you.bodyTakenBy).toBeUndefined();
  });
});

/** Each way a room launches (returning a seat token), with the config overrides it should record. */
const LAUNCHES: { name: string; env: Record<string, string>; launch: (room: Room) => Promise<string>; overrides: ConfigOverrides }[] = [
  { name: "setup", env: {}, launch: (r) => r.setup(seats(3), tokensFor(3)).then(() => "tok0"), overrides: {} },
  { name: "setup, cheats", env: CHEATS, launch: (r) => r.setup(seats(3), tokensFor(3)).then(() => "tok0"), overrides: { manualCycles: true } },
  { name: "ship", env: {}, launch: (r) => r.join("Ann", "chao").then((j) => (j.ok ? j.token : "")), overrides: { ...setupOverrides(STANDARD_KNOBS), setupId: "standard" } },
  {
    name: "dev ship",
    env: CHEATS,
    launch: (r) => r.join("Ann", "chao").then((j) => (j.ok ? j.token : "")),
    overrides: { ...setupOverrides(STANDARD_KNOBS), setupId: "standard", manualCycles: true },
  },
  { name: "single player", env: {}, launch: (r) => r.setupSinglePlayer("Guest 1", "chun"), overrides: { mushCount: 1, manualCycles: true, instantExpeditions: true } },
];
/** The room's in-memory game, config included. */
const gameOf = (room: Room) => (room as unknown as { game: GameState }).game;

describe("GameRoom persistence", () => {
  it.each(LAUNCHES)("records the launch's config and the overrides it came from ($name)", async ({ env, launch, overrides }) => {
    // The dev ship seats its bots on a timer, which must not outlive the test.
    vi.useFakeTimers();
    const storage = new FakeStorage();
    await launch(asRoom(storage, env)).finally(() => vi.useRealTimers());
    const setup = (await storage.get<GameSetup>("setup"))!;
    expect(setup.overrides).toEqual(overrides);
    expect(setup.config).toEqual(resolveConfig(overrides));
  });

  it.each(LAUNCHES)("stores the overrides instead of the config, and resolves it again on reload ($name)", async ({ env, launch, overrides }) => {
    vi.useFakeTimers();
    try {
      const storage = new FakeStorage();
      const token = await launch(asRoom(storage, env));
      const stored = () => storage.data.get("game") as { game: object; overrides: ConfigOverrides };
      expect(stored().game).not.toHaveProperty("config");
      expect(stored().overrides).toEqual(overrides);

      const revived = asRoom(storage, env);
      await revived.onStart();
      expect(gameOf(revived).config).toEqual(resolveConfig(overrides));
      // Saved again after the reload, still with the same overrides.
      const inputs = storage.data.size;
      await send(revived, connect(revived, token), { type: "chat", channel: CHAT_CHANNELS[0], text: "hello" });
      // The input, and the poster's read count (#400).
      expect(storage.data.size).toBe(inputs + 2);
      expect(stored().overrides).toEqual(overrides);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps equipment built, installed, dismantled or uninstalled during the game across a reload", async () => {
    const { room, storage } = await newRoom();
    const { equipment } = gameOf(room);
    const [room1, room2] = Object.keys(equipment).filter((r) => equipment[r]!.length > 0);
    // As build and dismantle leave it: one piece added, one room's map equipment gone.
    equipment[room1!]!.push({ id: "built-sofa", type: "SOFA" });
    equipment[room2!] = [];
    await send(room, connect(room, "tok0"), { type: "chat", channel: CHAT_CHANNELS[0], text: "hello" });
    const revived = asRoom(storage);
    await revived.onStart();
    expect(gameOf(revived).equipment).toEqual(equipment);
    expect(gameOf(revived).equipment).not.toEqual(DEFAULT_CONFIG.equipment);
  });

  it("keeps a ship's pre-selection rules from launch when PRESELECTION changes", async () => {
    const storage = new FakeStorage();
    await asRoom(storage).join("Ann", "chao");
    const before = structuredClone(PRESELECTION);
    try {
      PRESELECTION.seats = 6;
      PRESELECTION.endsOn = { day: 5, cycle: 1 };
      const revived = asRoom(storage);
      await revived.onStart();
      expect(gameOf(revived).config.preselection).toEqual(before);
    } finally {
      Object.assign(PRESELECTION, before);
    }
  });

  it("picks up a balance change (an edit to DEFAULT_CONFIG) on the next load", async () => {
    const { storage } = await newRoom();
    const before = DEFAULT_CONFIG.maxAp;
    try {
      DEFAULT_CONFIG.maxAp = 99;
      const revived = asRoom(storage);
      await revived.onStart();
      expect(gameOf(revived).config.maxAp).toBe(99);
    } finally {
      DEFAULT_CONFIG.maxAp = before;
    }
  });

  it("records each accepted input in order, beside the setup", async () => {
    const { room, storage } = await newRoom(3, new FakeStorage(), CHEATS);
    const c = connect(room, "tok0");
    await send(room, c, { type: "action", action: legalIn(lastView(c)).find((x) => x.type === "move")! });
    await send(room, c, { type: "action", action: { type: "ready" } });
    expect(storage.data.has("setup")).toBe(true);
    expect([...storage.data.keys()].filter((k) => k.startsWith("input:"))).toEqual(["input:000000000", "input:000000001"]);
  });

  it("restores the game, tokens and input count after a restart, dropping the action under way (#384)", async () => {
    const { room, storage } = await newRoom(3, new FakeStorage(), CHEATS);
    const c = connect(room, "tok0");
    const start = lastView(c).you.room;
    const move = legalIn(lastView(c)).find((x) => x.type === "move")! as { to: string };
    await send(room, c, { type: "action", action: move });
    const bar = storage.alarm;
    expect(lastView(c).you.current).not.toBeNull();

    // Evicted with the move under way: the load drops it, and the record says so with a dropQueues input.
    const revived = asRoom(storage, CHEATS);
    await revived.onStart();
    expect(storage.alarm).not.toBe(bar);
    expect(storage.data.get("input:000000001")).toEqual(expect.objectContaining({ input: { type: "dropQueues" } }));
    const c2 = connect(revived, "tok0");
    expect(lastView(c2).you.room).toBe(start);
    expect(lastView(c2).you.current).toBeNull();
    // The player presses again.
    await send(revived, c2, { type: "action", action: move });
    expect(storage.data.get("input:000000002")).toMatchObject({ input: { type: "action" } }); // continued the record, didn't overwrite it
  });

  it("records the actions a restart dropped, so the record still rebuilds the stored state and the history every view (#384)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 19, 14));
    const storage = new FakeStorage();
    const { room } = await newRoom(3, storage, CHEATS);
    const c0 = connect(room, "tok0");
    const c1 = connect(room, "tok1");
    await send(room, c0, { type: "chat", channel: CHAT_CHANNELS[0], text: "hello" });
    // Two players mid-action, the first with more queued behind it.
    const moves = legalIn(lastView(c0)).filter((x) => x.type === "move");
    await send(room, c0, { type: "action", action: moves[0]! });
    await send(room, c0, { type: "action", action: moves.at(-1)! });
    await send(room, c1, { type: "action", action: legalIn(lastView(c1)).find((x) => x.type === "move")! });
    const json = <T>(v: unknown) => JSON.parse(JSON.stringify(v)) as T;
    const before = json<{ game: GameState }>(await storage.get("game")).game;
    expect(before.players.find((p) => p.id === "p0")!.queue.length).toBeGreaterThan(0);
    expect(before.players.find((p) => p.id === "p1")!.current).not.toBeNull();

    const revived = asRoom(storage, CHEATS);
    await revived.onStart();
    const c2 = connect(revived, "tok0");
    await send(revived, c2, { type: "chat", channel: CHAT_CHANNELS[0], text: "back" });
    vi.useRealTimers();

    const record = json<RecordedInput[]>([...(await storage.list({ prefix: "input:" })).values()]);
    // One input for both players, carrying the view as loaded and no change.
    const dropped = record.filter((r) => r.input.type === "dropQueues");
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.history).toHaveProperty("base");
    expect(dropped[0]!.history).not.toHaveProperty("diff");

    const setup = json<GameSetup>(await storage.get("setup"));
    const { game: stored, overrides, starts } = json<{ game: object; overrides: ConfigOverrides; starts: SeatStarts }>(await storage.get("game"));
    expect(rebuildGame(setup, record)).toEqual({ ...stored, config: resolveConfig(overrides) });
    expectHistory(setup, record, starts);
  });

  it("records each chat message's id, so a report can cite it after the state drops it (#292)", async () => {
    const { room, storage } = await newRoom(3);
    const c = connect(room, "tok0");
    await send(room, c, { type: "chat", channel: CHAT_CHANNELS[0], text: "hello" });
    await send(room, c, { type: "chat", channel: CHAT_CHANNELS[0], text: "again" });
    const record = [...(await storage.list({ prefix: "input:" })).values()] as RecordedInput[];
    const ids = record.filter((r) => r.input.type === "chat").map((r) => r.chatId);
    const kept = (storage.data.get("game") as { game: GameState }).game.chat.filter((m) => m.from !== null);
    expect(kept.map((m) => m.text)).toEqual(["hello", "again"]);
    expect(ids).toEqual(kept.map((m) => m.id));
    // The live view names them by seq, never by the id (#355).
    expect(lastView(c).chat.some((m) => "id" in m)).toBe(false);
    // Other inputs carry none.
    await send(room, c, { type: "action", action: legalIn(lastView(c)).find((x) => x.type === "move")! });
    expect(storage.data.get("input:000000002")).toMatchObject({ input: { type: "action" } });
    expect(storage.data.get("input:000000002")).not.toHaveProperty("chatId");
  });

  it("sends a checklist's ticks from a page two back to its channel's readers only, and the record's id finds it on its stored page (#355, #292)", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      const { room, storage } = await newRoom(3);
      const [c0, c1, c2] = ["tok0", "tok1", "tok2"].map((t) => connect(room, t));
      await send(room, c0, { type: "createChannel", name: "crew", members: [lastView(c1!).you.id] });
      const channel = lastView(c0!).privateChannels[0]!.id;
      // Each past the chat rate limit, well short of a cycle.
      const social = async (msg: unknown) => {
        vi.setSystemTime(Date.now() + 2_001);
        await send(room, c0!, msg);
      };
      const say = (text: string) => social({ type: "chat", channel, text });
      const edits = (c: Conn) => c.messages<GameServerMessage>().filter((m) => m.type === "chatEdit");
      await say("- [ ] hull\n- [ ] oxygen");
      // On the open page, the views carry the tick.
      await social({ type: "toggleCheckbox", channel, seq: 0, line: 0 });
      expect(lastView(c1!).chat.find((m) => m.channel === channel && m.seq === 0)!.text).toBe("- [x] hull\n- [ ] oxygen");
      expect(edits(c1!)).toEqual([]);
      for (let i = 1; i <= 2 * CHAT_PAGE; i++) await say(`line ${i}`);
      expect(lastView(c1!).chatCounts[channel]).toBe(2 * CHAT_PAGE + 1);
      expect(lastView(c1!).chat.some((m) => m.channel === channel && m.seq === 0)).toBe(false);
      await social({ type: "toggleCheckbox", channel, seq: 0, line: 1 });
      const edit = { type: "chatEdit", channel, seq: 0, mark: { tasks: [0, 1], checked: [0, 1] } };
      expect(edits(c0!)).toEqual([edit]);
      expect(edits(c1!)).toEqual([edit]);
      expect(edits(c2!)).toEqual([]);
      // The stored page keeps the text as typed, and the recorded id names the message on it.
      const page = storage.data.get(chatPageKey(channel, 0)) as ChatMessage[];
      expect(page[0]!.text).toBe("- [ ] hull\n- [ ] oxygen");
      const record = [...(await storage.list({ prefix: "input:" })).values()] as RecordedInput[];
      expect(record.find((r) => r.input.type === "chat")!.chatId).toBe(page[0]!.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers chatPage from storage or the state for a reader, and refuses everyone else alike without reading storage (#355)", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      const { room, storage } = await newRoom(3);
      const [c0, c1, c2] = ["tok0", "tok1", "tok2"].map((t) => connect(room, t));
      await send(room, c0, { type: "createChannel", name: "crew", members: [lastView(c1!).you.id] });
      const channel = lastView(c0!).privateChannels[0]!.id;
      const say = async (text: string) => {
        vi.setSystemTime(Date.now() + 2_001);
        await send(room, c0!, { type: "chat", channel, text });
      };
      await say("- [ ] hull");
      for (let i = 1; i <= 2 * CHAT_PAGE; i++) await say(`line ${i}`);
      await say("- [ ] hull");
      vi.setSystemTime(Date.now() + 2_001);
      await send(room, c0!, { type: "toggleCheckbox", channel, seq: 0, line: 0 });
      const ask = async (c: Conn, page: number, on: string = channel) => {
        vi.setSystemTime(Date.now() + 2_001);
        await send(room, c, { type: "chatPage", channel: on, page });
        return c.messages<GameServerMessage>().at(-1)!;
      };
      const page0 = await ask(c1!, 0);
      expect(page0.type).toBe("chatPage");
      const lines = (page0 as Extract<GameServerMessage, { type: "chatPage" }>).messages;
      expect(lines.map((m) => m.seq)).toEqual(Array.from({ length: CHAT_PAGE }, (_, i) => i));
      expect(lines[0]!.text).toBe("- [x] hull");
      for (const m of lines) expect(m).not.toHaveProperty("id");
      const page2 = (await ask(c1!, 2)) as Extract<GameServerMessage, { type: "chatPage" }>;
      expect(page2.messages.map((m) => m.seq)).toEqual([2 * CHAT_PAGE, 2 * CHAT_PAGE + 1]);
      // Not a member, a page not begun, a channel with no messages: one error, and storage is never read.
      const get = vi.spyOn(storage, "get");
      const refused = { type: "error", message: "chat_page_unavailable" };
      expect(await ask(c2!, 0)).toEqual(refused);
      expect(await ask(c1!, 3)).toEqual(refused);
      expect(await ask(c1!, 0, "mush")).toEqual(refused);
      expect(await ask(c1!, 0, "pc-999")).toEqual(refused);
      expect(get).not.toHaveBeenCalled();
      // Not an input: nothing recorded.
      const record = [...(await storage.list({ prefix: "input:" })).values()] as RecordedInput[];
      expect(record.some((r) => (r.input.type as string) === "chatPage")).toBe(false);
      // Rate-limited apart from chat, at chat's numbers.
      for (let i = 0; i < 5; i++) await send(room, c1!, { type: "chatPage", channel, page: 2 });
      expect(c1!.messages<GameServerMessage>().at(-1)).toEqual({ type: "error", message: "too_many_messages" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("stores each sealed chat page beside the snapshot, and deletes a private channel's pages with it (#355)", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      const { room, storage } = await newRoom(3);
      const c = connect(room, "tok0");
      await send(room, c, { type: "createChannel", name: "crew" });
      const channel = lastView(c).privateChannels[0]!.id;
      const say = async (target: ChannelId, n: number) => {
        for (let i = 0; i < n; i++) {
          // Past the chat rate limit, well short of a cycle.
          vi.setSystemTime(Date.now() + 2_001);
          await send(room, c, { type: "chat", channel: target, text: `${target} ${i}` });
        }
      };
      await say(channel, CHAT_PAGE + 1);
      await say(CHAT_CHANNELS[0], CHAT_PAGE + 1);
      const page = storage.data.get(chatPageKey(channel, 0)) as ChatMessage[];
      expect(page.map((m) => m.text)).toEqual(Array.from({ length: CHAT_PAGE }, (_, i) => `${channel} ${i}`));
      expect(page.every((m) => m.at !== undefined)).toBe(true);
      expect(storage.data.has(chatPageKey(CHAT_CHANNELS[0], 0))).toBe(true);
      const stored = (storage.data.get("game") as { game: GameState }).game;
      expect(stored.chatOutbox).toEqual({ sealed: [], dropped: [] });
      expect(lastView(c).chatCounts[channel]).toBe(CHAT_PAGE + 1);
      await send(room, c, { type: "leaveChannel", channel });
      expect(storage.data.has(chatPageKey(channel, 0))).toBe(false);
      expect(storage.data.has(chatPageKey(CHAT_CHANNELS[0], 0))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops a snapshot stored before MIN_STATE_VERSION, but keeps the record and launches nothing over it", async () => {
    const { room, storage } = await newRoom(3, new FakeStorage(), CHEATS);
    const c = connect(room, "tok0");
    await send(room, c, { type: "chat", channel: CHAT_CHANNELS[0], text: "hello" });
    const stored = storage.data.get("game") as { version: number };
    stored.version = -1;
    const record = [...storage.data.keys()].filter((k) => k !== "game");
    for (const restart of [1, 2]) {
      const revived = asRoom(storage);
      await revived.onStart();
      expect([...storage.data.keys()], `restart ${restart}`).toEqual(record);
      expect(connect(revived, "tok0").closed?.code).toBe(4001);
      await expect(revived.setup(seats(3), tokensFor(3))).rejects.toThrow("already set up");
      expect(await revived.join("Ann", CHARACTERS[0]!.id)).toEqual({ ok: false, error: "ship_closed" });
    }
    expect(storage.data.get("input:000000000")).toMatchObject({ input: { type: "chat", text: "hello" } });
  });

  it("stores exactly the state its record rebuilds: bots, ticks, cycles and chat all go through the record (#167)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 19, 14));
    const { room, storage } = await newRoom(1, new FakeStorage(), CHEATS);
    const c = connect(room, "tok0");
    await send(room, c, { type: "chat", channel: CHAT_CHANNELS[0], text: "hello" });
    await send(room, c, { type: "action", action: legalIn(lastView(c)).find((x) => x.type === "move")! });
    await vi.advanceTimersByTimeAsync(1600);
    vi.setSystemTime(Date.UTC(2026, 9, 19, 15));
    await room.onAlarm();
    await vi.advanceTimersByTimeAsync(1600);
    vi.useRealTimers();
    // Through JSON, as the runtime stores it.
    const json = <T>(v: unknown) => JSON.parse(JSON.stringify(v)) as T;
    const record = json<RecordedInput[]>([...(await storage.list({ prefix: "input:" })).values()]);
    const types = new Set(record.map((r) => r.input.type));
    for (const type of ["chat", "action", "tick", "cycle"]) expect(types, type).toContain(type);
    expect(record.some((r) => "by" in r.input && r.input.by !== "p0"), "a bot input").toBe(true);
    const { game: stored, overrides } = json<{ game: object; overrides: ConfigOverrides }>(await storage.get("game"));
    expect(stored).not.toHaveProperty("config");
    expect(rebuildGame(json<GameSetup>(await storage.get("setup")), record)).toEqual({ ...stored, config: resolveConfig(overrides) });
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
    const reply = () => new Response(JSON.stringify({ choices: [{ message: { content: "GOAL: 1" } }] }));

    it("ask the dev model, play its choices, and keep count of the calls", async () => {
      const fetch = vi.fn(async () => reply());
      vi.stubGlobal("fetch", fetch);
      const { storage } = await modelRoom({ ...DEV, ...MODEL });
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
      const room = asRoom(storage, { ...DEV, ...MODEL });
      await room.setup(seats(1).map((seat, i) => (i === 1 ? { ...seat, botKind: "model" as const } : seat)), tokensFor(1));
      await vi.advanceTimersByTimeAsync(1600);
      // The log parrots ended their cycles meanwhile, and each of those rescheduled the bots.
      expect([...storage.data.keys()].filter((k) => k.startsWith("input:")).length).toBeGreaterThan(0);
      expect(fetch).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    it("pause when the model fails, tell the players, and retry with backoff until it answers (#114)", async () => {
      let failing = true;
      const fetch = vi.fn(async () => (failing ? new Response("nope", { status: 500 }) : reply()));
      vi.stubGlobal("fetch", fetch);
      const { room, storage } = await modelRoom({ ...DEV, ...MODEL });
      const human = connect(room, "tok0");
      const byModelBots = () =>
        [...storage.data].filter(([k, v]) => k.startsWith("input:") && ["p1", "p2", "p3"].includes((v as { input: { by: string } }).input.by)).length;
      await vi.advanceTimersByTimeAsync(1000);
      expect(byModelBots()).toBe(0);
      expect(lastMsg(human)).toMatchObject({ type: "view", botsPaused: "unavailable" });
      const calls = fetch.mock.calls.length;
      // Retried after the backoff, not in a tight loop.
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetch.mock.calls.length).toBe(calls);
      failing = false;
      await vi.advanceTimersByTimeAsync(5000);
      expect(byModelBots()).toBeGreaterThan(0);
      expect(lastMsg(human)).toMatchObject({ type: "view", botsPaused: null });
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    it("stay paused, without retrying, once the provider refuses the key", async () => {
      const fetch = vi.fn(async () => new Response("no", { status: 401 }));
      vi.stubGlobal("fetch", fetch);
      const { room } = await modelRoom({ ...DEV, ...MODEL });
      const human = connect(room, "tok0");
      await vi.advanceTimersByTimeAsync(120_000);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(lastMsg(human)).toMatchObject({ type: "view", botsPaused: "key" });
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    it("play scripted where there is no key, and nothing is paused", async () => {
      vi.stubGlobal("fetch", vi.fn());
      const { room, storage } = await modelRoom({});
      const human = connect(room, "tok0");
      await vi.advanceTimersByTimeAsync(1600);
      const inputs = [...storage.data].filter(([k]) => k.startsWith("input:")).map(([, v]) => v as { input: { by: string } });
      expect(["p1", "p2", "p3"].every((id) => inputs.some((i) => i.input.by === id))).toBe(true);
      expect(lastMsg(human)).toMatchObject({ type: "view", botsPaused: null });
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    describe("chat (#223)", () => {
      /** A model that answers chat with `say` (a SAY line's text) when woken, routes every message to `route`, and otherwise picks the first goal. */
      const chatty = (say: string, route: (prompt: string) => string = wakeAll) =>
        vi.fn(async (_url: string, init: RequestInit) => {
          const [system, user] = (JSON.parse(init.body as string) as { messages: { content: string }[] }).messages.map((m) => m.content);
          const content = system!.startsWith("You route chat") ? route(user!) : user!.includes("A new chat message came in") ? `SAY: global: ${say}` : "GOAL: 1";
          return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
        });
      const promptsOf = (fetch: ReturnType<typeof vi.fn>, from = 0) =>
        (fetch.mock.calls.slice(from) as unknown as [string, RequestInit][]).map(([, init]) => (JSON.parse(init.body as string) as { messages: { content: string }[] }).messages);
      /** Lets time pass, firing alarms so action bars end and busy bots become free to answer. */
      const pass = async (room: Room, storage: FakeStorage, ms: number) => {
        for (let t = 0; t < ms; t += 500) {
          await vi.advanceTimersByTimeAsync(500);
          if (storage.alarm !== null && storage.alarm <= Date.now()) await room.onAlarm();
        }
      };
      const botMessages = (room: Room) => gameOf(room).chat.filter((m) => m.from !== null && ["p1", "p2", "p3"].includes(m.from));

      it("wake every model bot but the author; replies are posted as AI, and a chain stops at the depth limit", async () => {
        const fetch = chatty("heard you");
        vi.stubGlobal("fetch", fetch);
        const { room, storage } = await modelRoom({ ...DEV, ...MODEL });
        const human = connect(room, "tok0");
        await pass(room, storage, 1500);
        expect(botMessages(room)).toHaveLength(0);
        await send(room, human, { type: "chat", channel: "global", text: "anyone there?" });
        await pass(room, storage, 10_000);
        const said = botMessages(room);
        expect(said.length).toBeGreaterThan(0);
        expect(said.every((m) => m.isBot && m.channel === "global" && m.text === "heard you")).toBe(true);
        // Three bots, each answering at most once per depth 1..BOT_CHAT_CHAIN_DEPTH; then the chain is spent.
        expect(said.length).toBeLessThanOrEqual(3 * BOT_CHAT_CHAIN_DEPTH);
        await pass(room, storage, 10_000);
        expect(botMessages(room)).toHaveLength(said.length);
        vi.unstubAllGlobals();
        vi.useRealTimers();
      });

      it("moderate a bot's message like a person's: links stripped, the raw text kept for moderators", async () => {
        vi.stubGlobal("fetch", chatty("visit https://evil.example now"));
        const { room, storage } = await modelRoom({ ...DEV, ...MODEL });
        const human = connect(room, "tok0");
        await pass(room, storage, 1500);
        await send(room, human, { type: "chat", channel: "global", text: "hello" });
        await pass(room, storage, 10_000);
        // Links are stripped before anyone sees them; the raw text is kept for moderators only, as for a person.
        expect(botMessages(room).length).toBeGreaterThan(0);
        expect(JSON.stringify(gameOf(room).chat)).not.toContain("evil.example");
        expect(JSON.stringify(human.sent)).not.toContain("evil.example");
        const raw = [...storage.data].filter(([k]) => k.startsWith("input:")).map(([, v]) => v as { input: { by: string }; raw?: string });
        expect(raw.some((r) => ["p1", "p2", "p3"].includes(r.input.by) && r.raw?.includes("evil.example"))).toBe(true);
        vi.unstubAllGlobals();
        vi.useRealTimers();
      });

      it("wake only the bots that can read the channel: a private message wakes no outsider (leak)", async () => {
        // Never says anything, so no reply chain wakes anyone else.
        const fetch = vi.fn(async () => reply());
        vi.stubGlobal("fetch", fetch);
        const { room, storage } = await modelRoom({ ...DEV, ...MODEL });
        const human = connect(room, "tok0");
        await pass(room, storage, 1500);
        await send(room, human, { type: "createChannel", members: ["p1"] });
        const channel = lastView(human).privateChannels.find((c) => c.members.includes("p1"))!.id;
        await pass(room, storage, 2000);
        const before = fetch.mock.calls.length;
        await send(room, human, { type: "chat", channel, text: "just between us" });
        await pass(room, storage, 10_000);
        const all = promptsOf(fetch, before);
        // Members of a private channel are woken outright: no router call.
        expect(all.some((m) => m[0]!.content.startsWith("You route chat"))).toBe(false);
        const woken = all.map((m) => m[1]!.content).filter((p) => p.includes("A new chat message came in"));
        const insider = characterName(gameOf(room).players.find((p) => p.id === "p1")!.character);
        expect(woken.length).toBeGreaterThan(0);
        expect(woken.every((p) => p.includes(`You are ${insider},`))).toBe(true);
        vi.unstubAllGlobals();
        vi.useRealTimers();
      });

      it("wake only the bots the router names, and nobody when it says nobody or fails (#341)", async () => {
        let route: (prompt: string) => string = () => `WAKE: ${characterName(gameOf(room).players.find((p) => p.id === "p2")!.character)}`;
        const fetch = chatty("heard you", (prompt) => route(prompt));
        vi.stubGlobal("fetch", fetch);
        const { room, storage } = await modelRoom({ ...DEV, ...MODEL });
        const human = connect(room, "tok0");
        await pass(room, storage, 1500);
        const before = fetch.mock.calls.length;
        await send(room, human, { type: "chat", channel: "global", text: "hey you" });
        await pass(room, storage, 1500);
        // The human's message is routed once, then only p2 answers (its own reply is routed too, and wakes p2 nobody else).
        const routed = promptsOf(fetch, before).filter((m) => m[0]!.content.startsWith("You route chat"));
        expect(routed.length).toBeGreaterThanOrEqual(1);
        expect(routed[0]![1]!.content).toContain('"hey you"');
        expect(botMessages(room).map((m) => m.from)).toEqual(["p2"]);

        route = () => "WAKE: nobody";
        await send(room, human, { type: "chat", channel: "global", text: "nice weather" });
        await pass(room, storage, 5000);
        expect(botMessages(room)).toHaveLength(1);

        // A failed router call wakes nobody, never everybody.
        route = () => {
          throw new Error("down");
        };
        await send(room, human, { type: "chat", channel: "global", text: "everyone answer" });
        await pass(room, storage, 5000);
        expect(botMessages(room)).toHaveLength(1);
        vi.unstubAllGlobals();
        vi.useRealTimers();
      });

      it("don't wake bots without a key", async () => {
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);
        const { room } = await modelRoom({});
        const human = connect(room, "tok0");
        await send(room, human, { type: "chat", channel: "global", text: "hello" });
        await vi.advanceTimersByTimeAsync(5000);
        expect(fetch).not.toHaveBeenCalled();
        expect(botMessages(room)).toHaveLength(0);
        vi.unstubAllGlobals();
        vi.useRealTimers();
      });
    });
  });
});

describe("GameRoom single player", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 19, 14, 10) });
    return () => vi.useRealTimers();
  });

  /** Runs the bots' timers and fires each alarm (their action bars) as it comes due, for 30 seconds of game time. */
  async function playOut(room: Room, storage: FakeStorage) {
    for (let i = 0; i < 60; i++) {
      await vi.advanceTimersByTimeAsync(500);
      if (storage.alarm !== null && storage.alarm <= Date.now()) await room.onAlarm();
    }
  }

  async function soloRoom(env: Record<string, string> = {}) {
    const storage = new FakeStorage();
    const room = asRoom(storage, env);
    const token = await room.setupSinglePlayer("Guest 1", "chun");
    return { room, storage, token };
  }

  it("seats the player as the only Mush with 8 AI bots, and gives out one token", async () => {
    const { room, storage, token } = await soloRoom();
    const c = connect(room, token);
    const view = lastView(c);
    expect(view.you).toMatchObject({ id: "p0", character: "chun", role: "mush" });
    expect(view.players).toHaveLength(8);
    expect(view.players.every((p) => p.isBot)).toBe(true);
    expect(Object.keys((storage.data.get("game") as { tokens: object }).tokens)).toEqual([token]);
    await expect(room.setupSinglePlayer("Guest 2", "ian")).rejects.toThrow("already set up");
  });

  it("has no cycle clock: no countdown, no alarm, and End cycle on without cheats", async () => {
    const { room, storage, token } = await soloRoom();
    const c = connect(room, token);
    expect(lastViewMsg(c)).toMatchObject({ type: "view", nextCycleAt: null });
    expect(storage.alarm).toBeNull();
    expect(legalIn(lastView(c))).toContainEqual({ type: "ready" });
    // Hours pass on the clock; the cycle doesn't change.
    vi.setSystemTime(Date.UTC(2026, 9, 19, 20));
    await room.onAlarm();
    expect(lastView(c).cycleOfDay).toBe(5);
  });

  it("ends the cycle once the player and every bot have ended theirs, while bots stay unready and responsive until the human readies", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { room, storage, token } = await soloRoom();
    const c = connect(room, token);
    // Let bots finish their solo actions while the human is still unready: no bot sends `ready` yet.
    for (let i = 0; i < 10; i++) await playOut(room, storage);
    expect(lastView(c).cycleOfDay).toBe(5);
    expect(lastView(c).players.every((p) => !p.ready)).toBe(true);
    await send(room, c, { type: "action", action: { type: "ready" } });
    for (let i = 0; i < 20 && lastView(c).cycleOfDay === 5; i++) await playOut(room, storage);
    expect(lastView(c).cycleOfDay).toBe(6);
    vi.unstubAllGlobals();
  });

  it("drops a chat wake when a woken bot dies before its turn, so the cycle still ends", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const [system, user] = (JSON.parse(init.body as string) as { messages: { content: string }[] }).messages.map((m) => m.content);
        const content = system!.startsWith("You route chat") ? wakeAll(user!) : "GOAL: 1";
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
      }),
    );
    const { room, storage, token } = await soloRoom({ ...DEV, MODEL_BASE_URL: "https://example.test/v1", MODEL_NAME: "m", MODEL_API_KEY: "dev-key" });
    const c = connect(room, token);
    // Wake every model bot with a chat message, then kill one before the 500ms bot timer fires.
    await send(room, c, { type: "chat", channel: "global", text: "anyone there?" });
    const victim = gameOf(room).players.find((p) => p.id !== "p0" && p.alive)!;
    victim.alive = false;
    victim.hp = 0;
    await send(room, c, { type: "action", action: { type: "ready" } });
    for (let i = 0; i < 20 && lastView(c).cycleOfDay === 5; i++) await playOut(room, storage);
    expect(lastView(c).cycleOfDay).toBe(6);
    vi.unstubAllGlobals();
  });

  it("keeps waiting for paused bots: the cycle doesn't end while the model is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    const { room, storage, token } = await soloRoom({ ...DEV, MODEL_BASE_URL: "https://example.test/v1", MODEL_NAME: "m", MODEL_API_KEY: "dev-key" });
    const c = connect(room, token);
    await send(room, c, { type: "action", action: { type: "ready" } });
    await playOut(room, storage);
    expect(lastView(c).cycleOfDay).toBe(5);
    expect(lastMsg(c)).toMatchObject({ type: "view", botsPaused: "unavailable" });
    vi.unstubAllGlobals();
  });

  describe("the player's own model key (BYOK, #216)", () => {
    const KEY = "sk-or-v1-secret-player-key";
    const setModel = { type: "setModel", provider: "openrouter", model: "some/model", apiKey: KEY };
    const reply = () => new Response(JSON.stringify({ choices: [{ message: { content: "GOAL: 1" } }] }));
    const disconnect = (room: Room, c: Conn) => {
      (room as unknown as FakeServer).connections.delete(c as never);
      room.onClose(c as never);
    };

    it("plays the bots on the player's key at the provider's fixed URL, and never stores, sends or logs it", async () => {
      const fetch = vi.fn(async () => reply());
      vi.stubGlobal("fetch", fetch);
      const warn = vi.spyOn(console, "warn");
      const { room, storage, token } = await soloRoom();
      const c = connect(room, token);
      await send(room, c, setModel);
      await playOut(room, storage);
      expect(fetch).toHaveBeenCalled();
      const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
      expect(JSON.parse(init.body as string)).toMatchObject({ model: "some/model" });
      expect(JSON.stringify([...storage.data])).not.toContain(KEY);
      expect(c.sent.join("\n")).not.toContain(KEY);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY);
      warn.mockRestore();
      vi.unstubAllGlobals();
    });

    it("is refused outside single player, and from a seat that isn't the human's", async () => {
      const fetch = vi.fn(async () => reply());
      vi.stubGlobal("fetch", fetch);
      const storage = new FakeStorage();
      const room = asRoom(storage, {});
      await room.setup(seats(2).map((seat, i) => (i >= 2 ? { ...seat, botKind: "model" as const } : seat)), tokensFor(2));
      for (const token of ["tok0", "tok1"]) {
        const c = connect(room, token);
        await send(room, c, setModel);
        expect(lastMsg(c)).toEqual({ type: "error", message: "not_single_player" });
      }
      await vi.advanceTimersByTimeAsync(1600);
      expect(fetch).not.toHaveBeenCalled();
      expect(JSON.stringify([...storage.data])).not.toContain(KEY);
      vi.unstubAllGlobals();
    });

    it("is dropped when the player's last connection closes, so the bots go back to scripted", async () => {
      const fetch = vi.fn(async () => reply());
      vi.stubGlobal("fetch", fetch);
      const { room, storage, token } = await soloRoom();
      const a = connect(room, token, "a");
      const b = connect(room, token, "b");
      await send(room, a, setModel);
      disconnect(room, a);
      await vi.advanceTimersByTimeAsync(1600);
      // Another tab is still open: the key stays.
      expect(fetch).toHaveBeenCalled();
      disconnect(room, b);
      await vi.advanceTimersByTimeAsync(1000);
      const calls = fetch.mock.calls.length;
      await send(room, connect(room, token, "c"), { type: "action", action: { type: "ready" } });
      await playOut(room, storage);
      expect(fetch.mock.calls.length).toBe(calls);
      vi.unstubAllGlobals();
    });

    it("clearModel drops it too", async () => {
      const fetch = vi.fn(async () => reply());
      vi.stubGlobal("fetch", fetch);
      const { room, storage, token } = await soloRoom();
      const c = connect(room, token);
      await send(room, c, setModel);
      await send(room, c, { type: "clearModel" });
      await playOut(room, storage);
      expect(fetch).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("wakes bots paused on a refused key once the player sets a new one", async () => {
      const fetch = vi.fn(async (_url: string, init: RequestInit) =>
        (init.headers as Record<string, string>).authorization === "Bearer bad-key" ? new Response("no", { status: 401 }) : reply(),
      );
      vi.stubGlobal("fetch", fetch);
      const { room, storage, token } = await soloRoom();
      const c = connect(room, token);
      await send(room, c, { ...setModel, apiKey: "bad-key" });
      await vi.advanceTimersByTimeAsync(1000);
      expect(lastMsg(c)).toMatchObject({ type: "view", botsPaused: "key" });
      const inputs = () => [...storage.data.keys()].filter((k) => k.startsWith("input:")).length;
      const before = inputs();
      await send(room, c, setModel);
      await vi.advanceTimersByTimeAsync(1000);
      expect(lastMsg(c)).toMatchObject({ type: "view", botsPaused: null });
      expect(inputs()).toBeGreaterThan(before);
      vi.unstubAllGlobals();
    });
  });

  it("stays single player after a restart", async () => {
    const { storage, token } = await soloRoom();
    const revived = asRoom(storage);
    await revived.onStart();
    expect(lastViewMsg(connect(revived, token))).toMatchObject({ type: "view", nextCycleAt: null });
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

describe("GameRoom accounts (#285)", () => {
  /** A ship with Ann and Bob aboard, each from a signed-in account, and their rows in D1 as the matchmaker writes them. */
  async function shipWithAccounts() {
    const db = migratedDatabase();
    const store = new AccountStore(db);
    const storage = new FakeStorage();
    const room = new GameRoom({ storage } as never, { RULES_VERSION: "test", DB: db } as never);
    const ids: string[] = [];
    const tokens: string[] = [];
    for (const [name, character] of [["Ann", "chao"], ["Bob", "chun"]] as const) {
      const created = await store.createAccount(name, "dev", name, Date.now());
      if (!created.ok) throw new Error(created.reason);
      ids.push(created.account.id);
      await store.boardShip(created.account.id, "test-room", Date.now());
      const joined = await room.join(name, character, STANDARD_SETUP, { accountId: created.account.id, sessionKey: `session-${name}` });
      if (!joined.ok) throw new Error(joined.error);
      tokens.push(joined.token);
    }
    const game = () => (room as unknown as { game: GameState }).game;
    return { room, store, storage, ids, tokens, game };
  }

  it("stores each seat's account beside the game, never in it or a view", async () => {
    const { room, storage, ids, tokens } = await shipWithAccounts();
    const stored = storage.data.get("game") as { game: unknown; accounts: Record<string, string> };
    expect(stored.accounts).toEqual({ p0: ids[0], p1: ids[1] });
    expect(JSON.stringify(stored.game)).not.toContain(ids[0]);
    expect(JSON.stringify([...storage.data.entries()].filter(([k]) => k.startsWith("input:")))).not.toContain(ids[0]);
    const c = connect(room, tokens[0]!);
    expect(c.sent.join()).not.toContain(ids[0]);
    expect(c.sent.join()).not.toContain(ids[1]);
    // The name at the time is the seat's name, hidden from the crew until the end screen (viewFor).
    expect(c.sent.join()).not.toContain("Bob");
  });

  it("resumes an aboard account with a new token, and lists who is aboard", async () => {
    const { room, ids } = await shipWithAccounts();
    const resumed = await room.resume(ids[0]!, "session-phone");
    if (!resumed.ok) throw new Error("not resumed");
    expect(lastView(connect(room, resumed.token))).toMatchObject({ you: { id: "p0" } });
    expect(await room.resume("someone-else", "s")).toEqual({ ok: false });
    expect(room.seatAccounts().sort()).toEqual([...ids].sort());
  });

  it("frees a dead player's account at once, and refuses to resume them", async () => {
    const { room, store, ids, tokens, game } = await shipWithAccounts();
    game().players.find((p) => p.id === "p0")!.alive = false;
    // The next input releases them.
    const bob = connect(room, tokens[1]!);
    await send(room, bob, { type: "chat", channel: "global", text: "hello" });
    expect(await store.currentShip(ids[0]!)).toBeNull();
    expect(await store.currentShip(ids[1]!)).toBe("test-room");
    expect(await room.resume(ids[0]!, "s")).toEqual({ ok: false });
    expect(room.seatAccounts()).toEqual([ids[1]]);
  });

  it("frees everyone when the game ends", async () => {
    const { room, store, ids, game } = await shipWithAccounts();
    game().phase = "ended";
    await (room as unknown as { releaseAccounts(): Promise<void> }).releaseAccounts();
    expect(await store.currentShip(ids[0]!)).toBeNull();
    expect(await store.currentShip(ids[1]!)).toBeNull();
    expect(room.seatAccounts()).toEqual([]);
  });

  it("revokes only the signed-out session's tokens and closes its sockets", async () => {
    const { room, ids, tokens } = await shipWithAccounts();
    const resumed = await room.resume(ids[0]!, "session-phone");
    if (!resumed.ok) throw new Error("not resumed");
    const desk = connect(room, tokens[0]!);
    const phone = connect(room, resumed.token);
    const bob = connect(room, tokens[1]!);
    await room.revokeSession("session-Ann");
    expect(desk.closed?.code).toBe(4001);
    expect(phone.closed).toBeNull();
    expect(bob.closed).toBeNull();
    expect(connect(room, tokens[0]!, "again").closed?.code).toBe(4001);
    expect(connect(room, resumed.token, "phone-again").closed).toBeNull();
  });

  it("Leave ship (a cheat) frees the account, drops the seat's tokens and closes its sockets; refused without cheats", async () => {
    const { room, store, ids, tokens, game } = await shipWithAccounts();
    const ann = connect(room, tokens[0]!);
    await send(room, ann, { type: "leaveShip" });
    expect(lastMsg(ann)).toEqual({ type: "error", message: "cheats_disabled" });
    expect(await store.currentShip(ids[0]!)).toBe("test-room");

    (room as unknown as { env: Record<string, string> }).env.ALLOW_CHEATS = "true";
    const resumed = await room.resume(ids[0]!, "session-phone");
    if (!resumed.ok) throw new Error("not resumed");
    const phone = connect(room, resumed.token);
    const bob = connect(room, tokens[1]!);
    const players = game().players.length;
    await send(room, ann, { type: "leaveShip" });
    expect(await store.currentShip(ids[0]!)).toBeNull();
    expect(await store.currentShip(ids[1]!)).toBe("test-room");
    expect(ann.closed?.code).toBe(4001);
    expect(phone.closed?.code).toBe(4001);
    expect(bob.closed).toBeNull();
    expect(connect(room, tokens[0]!, "again").closed?.code).toBe(4001);
    expect(await room.resume(ids[0]!, "s")).toEqual({ ok: false });
    expect(room.seatAccounts()).toEqual([ids[1]]);
    // The character stays aboard.
    expect(game().players).toHaveLength(players);
  });

  it("records each seat's account for good: it outlives a rename and a dropped snapshot (#292)", async () => {
    const { storage, store, ids } = await shipWithAccounts();
    expect(await store.rename(ids[0]!, "Annie", Date.now())).toBe("ok");
    // A state version bump drops the snapshot (and its `accounts`); the record stays.
    (storage.data.get("game") as { version: number }).version = -1;
    const revived = new GameRoom({ storage } as never, { RULES_VERSION: "test", DB: migratedDatabase() } as never);
    await revived.onStart();
    expect(storage.data.has("game")).toBe(false);
    expect(storage.data.get("account:p0")).toBe(ids[0]);
    expect(storage.data.get("account:p1")).toBe(ids[1]);
    // The seat keeps the name at the time; the account leads to the current name and every rename.
    const joins = ([...(await storage.list({ prefix: "input:" })).values()] as RecordedInput[]).filter((r) => r.input.type === "join");
    expect(joins[0]).toMatchObject({ input: { seat: { id: "p0", name: "Ann" } } });
    expect((await store.getAccount(storage.data.get("account:p0") as string))?.displayName).toBe("Annie");
    expect(await store.nameHistory(ids[0]!)).toMatchObject([{ oldName: "Ann", newName: "Annie" }]);
  });

  it("records no account for a seat joined without one", async () => {
    const storage = new FakeStorage();
    const room = asRoom(storage);
    expect(await room.join("Ann", "chao")).toMatchObject({ ok: true });
    expect([...storage.data.keys()].filter((k) => k.startsWith("account:"))).toEqual([]);
  });

  it("keeps a snapshot it can't read: refuses connections as unavailable and keeps its accounts aboard (#384)", async () => {
    for (const spoil of [
      (stored: { version: number }) => void (stored.version = STATE_VERSION + 1),
      (stored: { game: { players?: unknown } }) => void delete stored.game.players,
    ]) {
      const { storage, ids, tokens } = await shipWithAccounts();
      spoil(storage.data.get("game") as never);
      const before = structuredClone(storage.data);
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      for (const restart of [1, 2]) {
        const revived = new GameRoom({ storage } as never, { RULES_VERSION: "test", DB: migratedDatabase() } as never);
        await revived.onStart();
        expect(error).toHaveBeenCalledTimes(restart);
        expect(error.mock.lastCall?.[0]).toContain("UNAVAILABLE");
        // Nothing is deleted or rewritten.
        expect(storage.data, `restart ${restart}`).toEqual(before);
        expect(connect(revived, tokens[0]!).closed).toEqual({ code: 4002, reason: "Ship unavailable" });
        expect(await revived.resume(ids[0]!, "session-phone")).toEqual({ ok: false, unavailable: true });
        expect(() => revived.seatAccounts()).toThrow("unavailable");
        expect(await revived.join("Cy", "frieda")).toEqual({ ok: false, error: "ship_closed" });
        await expect(revived.setup(seats(3), tokensFor(3))).rejects.toThrow("already set up");
        expect(storage.data).toEqual(before);
      }
      error.mockRestore();
    }
  });

  it("revokes a signed-out session's tokens in a snapshot it can't read, so they stay revoked once it can (#384)", async () => {
    const { storage, tokens } = await shipWithAccounts();
    const stored = storage.data.get("game") as { version: number };
    stored.version = STATE_VERSION + 1;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const unreadable = new GameRoom({ storage } as never, { RULES_VERSION: "test", DB: migratedDatabase() } as never);
    await unreadable.onStart();
    await unreadable.revokeSession("session-Ann");
    error.mockRestore();
    // A later build reads it.
    (storage.data.get("game") as { version: number }).version = STATE_VERSION;
    const revived = new GameRoom({ storage } as never, { RULES_VERSION: "test", DB: migratedDatabase() } as never);
    await revived.onStart();
    expect(connect(revived, tokens[0]!).closed?.code).toBe(4001);
    expect(connect(revived, tokens[1]!, "bob").closed).toBeNull();
  });

  it("loads a readable snapshot as it was, and stamps this build on the history it records next (#384)", async () => {
    const { room, storage, ids } = await shipWithAccounts();
    const loaded = (room as unknown as { game: GameState }).game;
    const revived = new GameRoom({ storage } as never, { RULES_VERSION: "abc123", DB: migratedDatabase() } as never);
    await revived.onStart();
    expect((revived as unknown as { game: GameState }).game).toEqual(loaded);
    const resumed = await revived.resume(ids[0]!, "s");
    if (!resumed.ok) throw new Error("not resumed");
    await send(revived, connect(revived, resumed.token), { type: "chat", channel: CHAT_CHANNELS[0], text: "back" });
    const last = ([...(await storage.list({ prefix: "input:" })).values()] as RecordedInput[]).at(-1)!;
    expect(last.history).toMatchObject({ base: {}, build: { stateVersion: STATE_VERSION, rulesVersion: "abc123" } });
  });

  it("keeps accounts and session tokens across a restart", async () => {
    const { storage, ids } = await shipWithAccounts();
    const revived = new GameRoom({ storage } as never, { RULES_VERSION: "test", DB: migratedDatabase() } as never);
    await revived.onStart();
    expect(revived.seatAccounts().sort()).toEqual([...ids].sort());
  });
});

describe("GameRoom plans", () => {
  /** p0 creates a channel with p1 and p2 and posts a plan to the refectory. */
  async function planned() {
    vi.useFakeTimers({ now: 1_000_000 });
    const { room, storage } = await newRoom(3);
    const a = connect(room, "tok0");
    const b = connect(room, "tok1");
    await send(room, a, { type: "createChannel", name: "crew", members: ["p1", "p2"] });
    const channel = lastView(a).privateChannels.find((c) => c.name === "crew")!.id;
    await vi.advanceTimersByTimeAsync(10_000);
    const plan = { channel, room: "REFECTORY", purpose: "meal", slots: [{ kind: "onCall" }, { kind: "task", task: { type: "fiery_speech" } }] };
    await send(room, a, { type: "postPlan", plan: { ...plan, author: "p9", extra: 1 } });
    return { room, storage, a, b, channel, plan };
  }

  it("posts the creator's plan, records it with known keys only, and shows it to members", async () => {
    try {
      const { storage, a, b, plan } = await planned();
      expect(lastMsg(a).type).toBe("view");
      for (const c of [a, b]) expect(lastView(c).plans).toMatchObject([{ author: "p0", room: "REFECTORY", purpose: "meal", status: "open" }]);
      const record = [...(await storage.list<RecordedInput>({ prefix: "input:" })).values()];
      expect(record.at(-1)!.input).toEqual({ type: "postPlan", plan, by: "p0" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers a malformed postPlan with an error and records nothing", async () => {
    try {
      const { room, storage, b, channel } = await planned();
      const before = (await storage.list({ prefix: "input:" })).size;
      await send(room, b, { type: "postPlan", plan: { channel, room: "REFECTORY", purpose: "meal", slots: [{ kind: "task", task: { type: "execute" } }] } });
      expect(lastMsg(b)).toEqual({ type: "error", message: "malformed_message" });
      expect((await storage.list({ prefix: "input:" })).size).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a member who isn't the channel's creator", async () => {
    try {
      const { room, b, channel } = await planned();
      await vi.advanceTimersByTimeAsync(10_000);
      await send(room, b, { type: "postPlan", plan: { channel, room: "REFECTORY", purpose: "meal", slots: [{ kind: "onCall" }] } });
      expect(lastMsg(b)).toEqual({ type: "error", message: "plan_forbidden" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("comes under the per-seat chat rate limit", async () => {
    try {
      const { room, a, plan } = await planned();
      const errors: string[] = [];
      for (let i = 0; i < 7; i++) {
        await send(room, a, { type: "postPlan", plan });
        const m = lastMsg(a);
        if (m.type === "error") errors.push(m.message);
      }
      expect(errors).toContain("too_many_messages");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rebuilds from the record with the plan and its claims (#314)", async () => {
    try {
      const { room, storage, a, b } = await planned();
      const claim = legalIn(lastView(b)).find((x) => x.type === "claim_slot")!;
      await send(room, b, { type: "action", action: claim });
      expect(lastView(a).plans[0]!.slots[0]).toMatchObject({ holder: "p1" });
      const json = <T>(v: unknown) => JSON.parse(JSON.stringify(v)) as T;
      const record = json<RecordedInput[]>([...(await storage.list({ prefix: "input:" })).values()]);
      expect(record.map((r) => r.input.type)).toContain("postPlan");
      const { game: stored, overrides } = json<{ game: object; overrides: ConfigOverrides }>(await storage.get("game"));
      expect(rebuildGame(json<GameSetup>(await storage.get("setup")), record)).toEqual({ ...stored, config: resolveConfig(overrides) });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("GameRoom finished games list (#155)", () => {
  type Listing = { recordFinished(): Promise<void>; game: GameState; env: Record<string, unknown> };

  /** Three humans, p0 an alpha Mush chosen at launch, on a room that knows its D1 (or none, with `db: null`). */
  async function finishingRoom(db: ReturnType<typeof migratedDatabase> | null = migratedDatabase()) {
    const storage = new FakeStorage();
    const room = new GameRoom({ storage } as never, { RULES_VERSION: "test", REPLAYS: new FakeR2Bucket(), ...(db && { DB: db }) } as never);
    await room.setup(seats(3), tokensFor(3), { p0: "mush" });
    const inner = room as unknown as Listing;
    const end = () => {
      inner.game.phase = "ended";
      inner.game.winner = "humans";
      inner.game.ending = "sol";
    };
    const listed = async () => (db ? (await new GameStore(db).listFinished()).games : []);
    return { room, storage, inner, end, listed };
  }

  it("lists nothing while the game runs", async () => {
    const { inner, listed, storage } = await finishingRoom();
    await inner.recordFinished();
    expect(await listed()).toEqual([]);
    expect((storage.data.get("game") as { listed: boolean }).listed).toBe(false);
  });

  it("writes the finished game once, with the alpha Mush from launch", async () => {
    const { inner, end, listed, storage } = await finishingRoom();
    end();
    await inner.recordFinished();
    await inner.recordFinished();
    const games = await listed();
    expect(games).toHaveLength(1);
    expect(games[0]!.crew.find((c) => c.seat === "p0")).toMatchObject({ startRole: "mush", endRole: "mush" });
    expect((storage.data.get("game") as { listed: boolean }).listed).toBe(true);
  });

  it("retries a failed write from the alarm until it succeeds", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      const { room, inner, end, storage } = await finishingRoom(null);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      end();
      // No D1: the write fails, and the alarm is set to try again.
      await inner.recordFinished();
      await room.onAlarm();
      expect((storage.data.get("game") as { listed: boolean }).listed).toBe(false);
      expect(storage.alarm).not.toBeNull();
      const db = migratedDatabase();
      inner.env.DB = db;
      vi.setSystemTime(storage.alarm!);
      await room.onAlarm();
      expect((await new GameStore(db).listFinished()).games).toHaveLength(1);
      expect((storage.data.get("game") as { listed: boolean }).listed).toBe(true);
      expect(storage.alarm).toBeNull();
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it("records a single-player game only under its player's account, and never lists it publicly", async () => {
    for (const accountId of [undefined, "acc-1"]) {
      const db = migratedDatabase();
      if (accountId) await db.prepare("INSERT INTO accounts (id, display_name, name_key, created_at) VALUES (?, 'Solo', 'solo', 1)").bind(accountId).run();
      const room = new GameRoom({ storage: new FakeStorage() } as never, { RULES_VERSION: "test", DB: db } as never);
      await room.setupSinglePlayer("Solo", "chun", "fr", accountId);
      const inner = room as unknown as Listing;
      inner.game.phase = "ended";
      inner.game.winner = "mush";
      inner.game.ending = "humans_dead";
      await inner.recordFinished();
      const rows = await db.prepare("SELECT single_player AS sp, language FROM games").all<{ sp: number; language: string }>();
      expect(rows.results).toEqual(accountId ? [{ sp: 1, language: "fr" }] : []);
      expect((await new GameStore(db).listFinished()).games).toEqual([]);
    }
  });
});

describe("GameRoom replay history (#335)", () => {
  it("stores each input's change to the full view, and the history rebuilds fullViewFor at every step, across a restart and a cycle", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 19, 14));
    const storage = new FakeStorage();
    const { room } = await newRoom(3, storage, CHEATS);
    const c = connect(room, "tok0");
    await send(room, c, { type: "chat", channel: CHAT_CHANNELS[0], text: "hello" });
    await send(room, c, { type: "action", action: legalIn(lastView(c)).find((x) => x.type === "move")! });
    await vi.advanceTimersByTimeAsync(1600);
    // Evicted: the next input carries the view as the revived room loaded it.
    const revived = asRoom(storage, CHEATS);
    await revived.onStart();
    const c2 = connect(revived, "tok0");
    await send(revived, c2, { type: "chat", channel: CHAT_CHANNELS[0], text: "back" });
    vi.setSystemTime(Date.UTC(2026, 9, 19, 15));
    await revived.onAlarm();
    await send(revived, c2, { type: "action", action: { type: "ready" } });
    await send(revived, c2, { type: "chat", channel: CHAT_CHANNELS[0], text: "after" });
    vi.useRealTimers();

    const json = <T>(v: unknown) => JSON.parse(JSON.stringify(v)) as T;
    const record = json<RecordedInput[]>([...(await storage.list({ prefix: "input:" })).values()]);
    const steps = record.map((r) => r.history!);
    expect(steps.every((s) => s !== undefined)).toBe(true);
    // A full copy at the launch's first input, at the restart's first input and at every cycle; changes otherwise.
    const kinds = steps.map((s) => ("full" in s ? "full" : "base" in s ? "base" : "diff"));
    expect(kinds[0]).toBe("base");
    expect(kinds.filter((k) => k === "base")).toHaveLength(2);
    record.forEach((r, i) => {
      if (r.input.type === "cycle") expect(kinds[i]).toBe("full");
    });
    expect(record.some((r) => r.input.type === "cycle")).toBe(true);
    for (const s of steps) if ("v" in s) expect(s.v).toBe(HISTORY_VERSION);

    const setup = json<GameSetup>(await storage.get("setup"));
    const { starts } = json<{ starts: SeatStarts }>(await storage.get("game"));
    expectHistory(setup, record, starts);
  });

  it("keeps an ordinary input's change small: a chat line is an append, not a copy of the log", async () => {
    const { room, storage } = await newRoom(3);
    const c = connect(room, "tok0");
    await send(room, c, { type: "chat", channel: CHAT_CHANNELS[0], text: "first" });
    await send(room, c, { type: "chat", channel: CHAT_CHANNELS[0], text: "second" });
    const step = (storage.data.get("input:000000001") as RecordedInput).history!;
    expect(step).not.toHaveProperty("base");
    expect(JSON.stringify(step).length).toBeLessThan(500);
    expect(step).toMatchObject({ diff: { k: "o", c: { chat: { k: "a", a: [expect.objectContaining({ text: "second" })] } } } });
  });
});

describe("GameRoom replay copy to R2 (#336)", () => {
  type Copying = { copyReplay(): Promise<void>; persist(): Promise<void>; game: GameState; starts: SeatStarts | null; env: Record<string, unknown> };
  const json = <T>(v: unknown) => JSON.parse(JSON.stringify(v)) as T;
  const ready = (storage: FakeStorage) => (storage.data.get("game") as { replayReady?: boolean }).replayReady;

  /** A game with a few inputs and a cycle (two chunks), ended by hand; `last` is the full view after its last input. */
  async function endedRoom(bucket = new FakeR2Bucket(), storage = new FakeStorage()) {
    vi.setSystemTime(Date.UTC(2026, 9, 19, 14));
    const room = asRoom(storage, CHEATS);
    (room as unknown as Copying).env.REPLAYS = bucket;
    await room.setup(seats(3), tokensFor(3), { p0: "mush" });
    const c = connect(room, "tok0");
    await send(room, c, { type: "chat", channel: CHAT_CHANNELS[0], text: "hello" });
    vi.setSystemTime(Date.UTC(2026, 9, 19, 15));
    await room.onAlarm();
    await send(room, c, { type: "chat", channel: CHAT_CHANNELS[0], text: "after" });
    const inner = room as unknown as Copying;
    const last = json<FullView>(fullViewFor(inner.game, inner.starts));
    inner.game.phase = "ended";
    inner.game.winner = "humans";
    inner.game.ending = "sol";
    // Saved, as the input that ends a game is.
    await inner.persist();
    return { room, inner, storage, bucket, last };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    return () => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    };
  });

  it("copies nothing while the game runs", async () => {
    const bucket = new FakeR2Bucket();
    const { room, storage } = await newRoom(3, new FakeStorage(), { RULES_VERSION: "test" });
    (room as unknown as Copying).env.REPLAYS = bucket;
    await (room as unknown as Copying).copyReplay();
    expect(bucket.puts).toBe(0);
    expect(ready(storage)).toBe(false);
  });

  it("copies the chunks then the index, once, and they rebuild the game's last full view", async () => {
    const { inner, storage, bucket, last } = await endedRoom();
    await inner.copyReplay();
    await inner.copyReplay();
    expect(ready(storage)).toBe(true);
    const index = await bucket.json<ReplayIndex>(replayKeys.index("test-room"));
    expect(index).toMatchObject({ v: HISTORY_VERSION, roomId: "test-room", rulesVersion: "test", realTime: true });
    expect(index.seats).toHaveLength(8);
    expect(index.seats.find((s) => s.seat === "p0")).toMatchObject({ role: "mush" });
    expect(JSON.stringify(index)).not.toContain("Human 0");
    // Launch to the first cycle, then the cycle onward.
    expect(index.chunks).toHaveLength(2);
    expect(bucket.puts, "written once").toBe(index.chunks.length + 1);
    const inputs = (await storage.list({ prefix: "input:" })).size;
    expect(index.chunks.reduce((n, c) => n + c.inputs, 0)).toBe(inputs);
    const chunk = bucket.objects.get(replayKeys.chunk("test-room", 1))!;
    expect(chunk.httpMetadata).toEqual({ contentType: "application/json", contentEncoding: "gzip" });
    const entries = await bucket.json<ChunkEntry[]>(replayKeys.chunk("test-room", 1));
    expect(rebuildHistory(entries.map((e) => e.history)).at(-1)!.view).toEqual(last);
    // Each entry is only its time and history: no input, raw text or chat id.
    for (const e of entries) expect(Object.keys(e).sort()).toEqual(["at", "history"]);
  });

  it("retries a failed copy from the alarm, and isn't ready until every chunk and the index are written", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const bucket = new FakeR2Bucket();
    const { room, inner, storage } = await endedRoom(bucket);
    // The first chunk goes, the second fails: no index, not ready, a retry on the alarm.
    bucket.failAfter = 1;
    await inner.copyReplay();
    expect(ready(storage)).toBe(false);
    expect(bucket.objects.has(replayKeys.index("test-room"))).toBe(false);
    expect(storage.alarm).not.toBeNull();
    // Then only the index fails.
    bucket.failAfter = bucket.puts + 2;
    vi.setSystemTime(storage.alarm!);
    await room.onAlarm();
    expect(ready(storage)).toBe(false);
    expect(bucket.objects.has(replayKeys.index("test-room"))).toBe(false);
    bucket.failAfter = null;
    vi.setSystemTime(storage.alarm!);
    await room.onAlarm();
    expect(ready(storage)).toBe(true);
    expect(bucket.objects.has(replayKeys.index("test-room"))).toBe(true);
    expect((storage.data.get("game") as { replayReady: boolean }).replayReady).toBe(true);
  });

  it("finishes the copy in a room revived after one failed partway, and keeps the room's record", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const bucket = new FakeR2Bucket();
    const { inner, storage } = await endedRoom(bucket);
    bucket.failAfter = 1;
    await inner.copyReplay();
    expect(ready(storage)).toBe(false);
    bucket.failAfter = null;
    const revived = asRoom(storage, CHEATS);
    (revived as unknown as Copying).env.REPLAYS = bucket;
    await revived.onStart();
    vi.setSystemTime(storage.alarm!);
    await revived.onAlarm();
    expect(ready(storage)).toBe(true);
    expect(bucket.objects.has(replayKeys.index("test-room"))).toBe(true);
    expect((await storage.list({ prefix: "input:" })).size).toBeGreaterThan(0);
    expect(storage.data.has("setup")).toBe(true);
  });

  it("skips the copy for a single-player game played without an account", async () => {
    for (const accountId of [undefined, "acc-1"]) {
      const storage = new FakeStorage();
      const bucket = new FakeR2Bucket();
      const room = new GameRoom({ storage } as never, { RULES_VERSION: "test", REPLAYS: bucket } as never);
      const token = await room.setupSinglePlayer("Solo", "chun", "en", accountId);
      const c = connect(room, token);
      await send(room, c, { type: "chat", channel: CHAT_CHANNELS[0], text: "hi" });
      const inner = room as unknown as Copying;
      inner.game.phase = "ended";
      inner.game.winner = "mush";
      inner.game.ending = "humans_dead";
      await inner.copyReplay();
      expect(ready(storage)).toBe(true);
      expect(bucket.puts > 0).toBe(accountId !== undefined);
      // Single-player cycles end by End cycle, not a clock: the replay shows no countdown.
      if (accountId !== undefined) expect((await bucket.json<ReplayIndex>(replayKeys.index("test-room"))).realTime).toBe(false);
    }
  });
});

describe("GameRoom chat read state (#400)", () => {
  const global = CHAT_CHANNELS[0]!;
  const reads = (c: Conn) => c.messages<GameServerMessage>().filter((m) => m.type === "chatRead");
  const say = (room: Room, c: Conn, channel: ChannelId, text = "hi") => send(room, c, { type: "chat", channel, text });

  it("sends a connecting seat its counts after the view, as loaded on a restart and clamped to the channel", async () => {
    const { room, storage } = await newRoom();
    const a = connect(room, "tok0");
    expect(a.messages<GameServerMessage>().map((m) => m.type)).toEqual(["view", "chatRead"]);
    expect(reads(a)).toEqual([{ type: "chatRead", read: {} }]);
    await say(room, a, global);
    await storage.put("chatRead:p0", { [global]: 5 });
    const revived = asRoom(storage);
    await revived.onStart();
    expect(reads(connect(revived, "tok0"))).toEqual([{ type: "chatRead", read: { [global]: 1 } }]);
  });

  it("saves an update and sends it to the seat's other connections only, never answering the sender", async () => {
    const { room, storage } = await newRoom();
    const [a, a2, b] = [connect(room, "tok0", "a"), connect(room, "tok0", "a2"), connect(room, "tok1", "b")];
    for (let i = 0; i < 3; i++) await say(room, b, global);
    const [sentA, sentB] = [a.sent.length, reads(b).length];
    await send(room, a, { type: "chatRead", read: { [global]: 2 } });
    expect(storage.data.get("chatRead:p0")).toEqual({ [global]: 2 });
    expect(reads(a2).at(-1)).toEqual({ type: "chatRead", read: { [global]: 2 } });
    expect(a.sent.length).toBe(sentA);
    // No other seat ever hears of it.
    expect(reads(b)).toHaveLength(sentB);
    expect(JSON.stringify(b.sent)).not.toContain('"chatRead","read":{"global":2}');
  });

  it("answers an unreadable channel, an over-count and a rate-limited update alike: nothing sent, nothing stored", async () => {
    const { room, storage } = await newRoom(3, new FakeStorage(), {}, { p0: "human", p1: "mush" });
    const [a, b] = [connect(room, "tok0"), connect(room, "tok1")];
    await say(room, b, global);
    await say(room, b, MUSH_CHANNEL);
    await send(room, a, { type: "chatRead", read: { [global]: 1 } });
    const [stored, sent] = [storage.data.get("chatRead:p0"), a.sent.length];
    await send(room, a, { type: "chatRead", read: { [MUSH_CHANNEL]: 1 } });
    await send(room, a, { type: "chatRead", read: { [global]: 99 } });
    expect(storage.data.get("chatRead:p0")).toEqual(stored);
    // Six updates per 10 s: this one is the seventh, and would have raised the count.
    await say(room, b, global);
    for (let i = 0; i < 3; i++) await send(room, a, { type: "chatRead", read: {} });
    await send(room, a, { type: "chatRead", read: { [global]: 2 } });
    expect(storage.data.get("chatRead:p0")).toEqual(stored);
    expect(a.messages<GameServerMessage>().slice(sent).some((m) => m.type !== "view")).toBe(false);
  });

  it("posting raises the poster's count to the channel's count, on every connection the seat has", async () => {
    const { room, storage } = await newRoom();
    const [a, b] = [connect(room, "tok0"), connect(room, "tok1")];
    await say(room, b, global);
    await say(room, a, global);
    expect(storage.data.get("chatRead:p0")).toEqual({ [global]: 2 });
    expect(reads(a).at(-1)).toEqual({ type: "chatRead", read: { [global]: 2 } });
    expect(storage.data.get("chatRead:p1")).toEqual({ [global]: 1 });
  });

  it("keeps nothing for a bot seat", async () => {
    const { room, storage } = await newRoom();
    gameOf(room).players[1]!.isBot = true;
    const b = connect(room, "tok1");
    await say(room, b, global);
    await send(room, b, { type: "chatRead", read: { [global]: 1 } });
    expect(storage.data.has("chatRead:p1")).toBe(false);
    expect(reads(b)).toEqual([]);
  });

  it("follows the mind through a Transfer, sent filtered by the new body; the victim gets none of it", async () => {
    const { room, storage } = await newRoom(3, new FakeStorage(), {}, { p0: "mush", p1: "human" });
    const game = gameOf(room);
    const [mush, victim] = [game.players[0]!, game.players[1]!];
    mush.mushSkills.push("transfert");
    mush.room = victim.room = "LABORATORY";
    for (const o of game.players.slice(2)) o.room = "REFECTORY";
    game.contamination[victim.id] = 1;
    const mushConn = connect(room, "tok0");
    await send(room, mushConn, { type: "createChannel", name: "crew" });
    const crew = lastView(mushConn).privateChannels[0]!.id;
    await say(room, mushConn, crew);
    await say(room, mushConn, global);
    expect(storage.data.get("chatRead:p0")).toEqual({ [crew]: 1, [global]: 1 });
    await send(room, mushConn, { type: "action", action: { type: "body_transfer", target: victim.id } });
    const [again, victimConn] = [connect(room, "tok0", "again"), connect(room, "tok1", "victim")];
    // The crew channel stayed with the old body; the count is kept, but not sent.
    expect(reads(again)).toEqual([{ type: "chatRead", read: { [global]: 1 } }]);
    expect(reads(victimConn)).toEqual([{ type: "chatRead", read: {} }]);
    expect(storage.data.get("chatRead:p0")).toEqual({ [crew]: 1, [global]: 1 });
  });

  it("Leave ship deletes the seat's counts", async () => {
    const { room, storage } = await newRoom(3, new FakeStorage(), CHEATS);
    const a = connect(room, "tok0");
    await say(room, a, global);
    expect(storage.data.has("chatRead:p0")).toBe(true);
    await send(room, a, { type: "leaveShip" });
    expect(storage.data.has("chatRead:p0")).toBe(false);
  });

  it("drops a deleted private channel's count with the next write", async () => {
    const { room, storage } = await newRoom();
    const a = connect(room, "tok0");
    await send(room, a, { type: "createChannel", name: "crew" });
    const crew = lastView(a).privateChannels[0]!.id;
    await say(room, a, crew);
    await send(room, a, { type: "leaveChannel", channel: crew });
    expect(storage.data.get("chatRead:p0")).toEqual({ [crew]: 1 });
    await say(room, a, global);
    expect(storage.data.get("chatRead:p0")).toEqual({ [global]: 1 });
  });
});
