import {
  CHARACTERS,
  CHAT_CHANNELS,
  CHEAT_ROOM,
  CHAT_PAGE,
  chatPageKey,
  type ChannelId,
  type ChatMessage,
  DEFAULT_CONFIG,
  legalIn,
  PRESELECTION,
  rebuildGame,
  resolveConfig,
  setupOverrides,
  STANDARD_KNOBS,
  type ConfigOverrides,
  type GameServerMessage,
  type GameState,
  type GameSetup,
  type RecordedInput,
  type SeatStarts,
} from "@mush2/shared";
import { describe, expect, it, vi } from "vitest";

const { configBump } = vi.hoisted(() => ({ configBump: { maxAp: undefined as number | undefined } }));
vi.mock("../../shared/src/config.ts", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../shared/src/config.ts")>();
  return {
    ...mod,
    resolveConfig: (o?: Parameters<typeof mod.resolveConfig>[0]) => {
      const resolved = mod.resolveConfig(o);
      return configBump.maxAp !== undefined ? { ...resolved, maxAp: configBump.maxAp } : resolved;
    },
  };
});
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
  HOUR,
  expectHistory,
  nextCycleAt,
  send,
  lastMsg,
  lastView,
  gameOf,
} from "./gameRoomHarness.ts";

// Mocked before the harness imports GameRoom, so the room extends the fake server.
vi.mock("partyserver", () => ({ Server: FakeServer }));

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

describe("GameRoom build", () => {
  it("tells a connecting seat the server's build first, for the client's reload notice", async () => {
    const c = connect((await newRoom(3, new FakeStorage(), { RULES_VERSION: "abc123" })).room, "tok0");
    expect(c.messages<GameServerMessage>()[0]).toEqual({ type: "build", version: "abc123" });
  });
});

describe("GameRoom views never leak", () => {
  it("sends other seats as OtherPlayerView only, and never the RNG state", async () => {
    const { room } = await newRoom(3);
    const c = connect(room, "tok0");
    const payload = JSON.parse(c.sent[1]!); // [0] is the build
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

  it("refuses cheat inputs unless ALLOW_CHEATS is set, and records nothing", async () => {
    const { room, storage } = await newRoom(3);
    const c = connect(room, "tok0");
    await send(room, c, cheatMsg);
    expect(lastMsg(c)).toEqual({ type: "error", message: "cheats_disabled" });
    expect(lastView(c).you.cheats).toEqual([]);
    expect([...storage.data.keys()].some((k) => k.startsWith("input:"))).toBe(false);
  });

  it("takes the sender to the cheat room only where cheats are allowed (#170)", async () => {
    const { room: closed, storage } = await newRoom(3);
    const closedConn = connect(closed, "tok0");
    await send(closed, closedConn, { type: "cheatRoom" });
    expect(lastMsg(closedConn)).toEqual({ type: "error", message: "cheats_disabled" });
    expect([...storage.data.keys()].some((k) => k.startsWith("input:"))).toBe(false);

    const { room } = await newRoom(3, new FakeStorage(), CHEATS);
    const [a, b] = [connect(room, "tok0"), connect(room, "tok1")];
    const logBefore = lastView(b).log.length;
    await send(room, a, { type: "cheatRoom" });
    expect(lastView(a).you.room).toBe(CHEAT_ROOM);
    expect(lastView(a).roomEquipment.some((e) => e.type === "SUPERKUBE")).toBe(true);
    // The others get a fresh view too, with no log line about it.
    expect(lastView(b).log).toHaveLength(logBefore);
  });

  it("takes Superkube options only where cheats are allowed and from inside the cheat room (#170)", async () => {
    const { room: closed, storage } = await newRoom(3);
    const closedConn = connect(closed, "tok0");
    await send(closed, closedConn, { type: "kube", op: "dirty" });
    expect(lastMsg(closedConn)).toEqual({ type: "error", message: "cheats_disabled" });
    expect([...storage.data.keys()].some((k) => k.startsWith("input:"))).toBe(false);

    const { room } = await newRoom(3, new FakeStorage(), CHEATS);
    const a = connect(room, "tok0");
    await send(room, a, { type: "kube", op: "dirty" });
    expect(lastMsg(a)).toEqual({ type: "error", message: "not_in_cheat_room" });
    await send(room, a, { type: "cheatRoom" });
    await send(room, a, { type: "kube", op: "dirty" });
    expect(lastView(a).statuses).toContain("dirty");
    await send(room, a, { type: "kube", op: "teleport", arg: "LABORATORY" });
    expect(lastView(a).you.room).toBe("LABORATORY");
  });

  it("tells the client whether cheats are allowed", async () => {
    const off = connect((await newRoom(3)).room, "tok0");
    const on = connect((await newRoom(3, new FakeStorage(), { ALLOW_CHEATS: "true" })).room, "tok0");
    expect((off.messages<{ cheatsAllowed: boolean }>()[1])!.cheatsAllowed).toBe(false);
    expect((on.messages<{ cheatsAllowed: boolean }>()[1])!.cheatsAllowed).toBe(true);
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
  { name: "setup, cheats", env: CHEATS, launch: (r) => r.setup(seats(3), tokensFor(3)).then(() => "tok0"), overrides: { manualCycles: true, cheatRoom: true } },
  { name: "ship", env: {}, launch: (r) => r.join("Ann", "chao").then((j) => (j.ok ? j.token : "")), overrides: { ...setupOverrides(STANDARD_KNOBS), setupId: "standard" } },
  {
    name: "dev ship",
    env: CHEATS,
    launch: (r) => r.join("Ann", "chao").then((j) => (j.ok ? j.token : "")),
    overrides: { ...setupOverrides(STANDARD_KNOBS), setupId: "standard", manualCycles: true, cheatRoom: true },
  },
  { name: "single player", env: {}, launch: (r) => r.setupSinglePlayer("Guest 1", "chun"), overrides: { mushCount: 1, manualCycles: true, instantExpeditions: true } },
];
/** The room's in-memory game, config included. */
const gameOf = (room: Room) => (room as unknown as { game: GameState }).game;

describe("GameRoom persistence", () => {
  it("gives a ship the cheat room only if cheats were allowed at launch, whatever the flag says later (#170)", async () => {
    const hasRoom = (room: Room) => Object.hasOwn(gameOf(room).config.rooms, CHEAT_ROOM) && Object.hasOwn(gameOf(room).equipment, CHEAT_ROOM);
    for (const [launchEnv, laterEnv] of [[{}, CHEATS], [CHEATS, {}]] as const) {
      const storage = new FakeStorage();
      const room = asRoom(storage, launchEnv);
      await room.setup(seats(3), tokensFor(3));
      expect(hasRoom(room)).toBe(launchEnv === CHEATS);
      const revived = asRoom(storage, laterEnv);
      await revived.onStart();
      expect(hasRoom(revived)).toBe(launchEnv === CHEATS);
    }
  });

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
      // Bot memory (#440) isn't counted: a single-player ship's first save after launch also writes a key per bot.
      const keys = () => [...storage.data.keys()].filter((k) => !k.startsWith("bot:")).length;
      const inputs = keys();
      await send(revived, connect(revived, token), { type: "chat", channel: CHAT_CHANNELS[0], text: "hello" });
      // The input, the poster's read count (#400) and its room log read point, written on connect (#513).
      expect(keys()).toBe(inputs + 3);
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
    try {
      configBump.maxAp = 99;
      const revived = asRoom(storage);
      await revived.onStart();
      expect(gameOf(revived).config.maxAp).toBe(99);
    } finally {
      configBump.maxAp = undefined;
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
