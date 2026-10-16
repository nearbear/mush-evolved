import { CHAT_CHANNELS, type GameServerMessage, type PlayerView } from "@mush2/shared";
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
    const move = lastView(a).legalActions.find((x) => x.type === "move")!;
    await send(room, a, { type: "action", action: move });
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
    expect(lastMsg(c)).toEqual({ type: "error", message: "Malformed message" });
    await send(room, c, { type: "action", action: { type: "launchMissiles" } });
    expect(lastMsg(c)).toEqual({ type: "error", message: "Malformed message" });
    await room.onMessage(c as never, new ArrayBuffer(4));
    expect(lastMsg(c)).toEqual({ type: "error", message: "Malformed message" });
  });

  it("acts as the authenticated seat, ignoring any 'by' the client claims", async () => {
    const { room, storage } = await newRoom(3);
    const a = connect(room, "tok0");
    const b = connect(room, "tok1");
    const move = lastView(a).legalActions.find((x) => x.type === "move")!;
    const before = lastView(b).you.room;
    await send(room, a, { type: "action", by: "p1", action: move });
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
    expect(errors.filter((e) => (e as { message: string }).message === "Slow down")).toHaveLength(5);
    // The counter is saved with the next accepted change.
    const move = lastView(c).legalActions.find((x) => x.type === "move")!;
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
    expect(lastMsg(c)).toEqual({ type: "error", message: "Malformed message" });
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
    expect(lastMsg(a)).toEqual({ type: "error", message: "Empty message" });
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

describe("GameRoom persistence", () => {
  it("records each accepted input in order, beside the setup", async () => {
    const { room, storage } = await newRoom();
    const c = connect(room, "tok0");
    await send(room, c, { type: "action", action: lastView(c).legalActions.find((x) => x.type === "move")! });
    await send(room, c, { type: "action", action: { type: "ready" } });
    expect(storage.data.has("setup")).toBe(true);
    expect([...storage.data.keys()].filter((k) => k.startsWith("input:"))).toEqual(["input:000000000", "input:000000001"]);
  });

  it("restores the game, tokens and input count after a restart", async () => {
    const { room, storage } = await newRoom();
    const c = connect(room, "tok0");
    const move = lastView(c).legalActions.find((x) => x.type === "move")! as { to: string };
    await send(room, c, { type: "action", action: move });

    const revived = asRoom(storage);
    await revived.onStart();
    const c2 = connect(revived, "tok0");
    expect(lastView(c2).you.room).toBe(move.to);
    await send(revived, c2, { type: "action", action: { type: "ready" } });
    expect(storage.data.has("input:000000001")).toBe(true); // continued, didn't overwrite 0
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
    const { room, storage } = await newRoom(1); // seats p1..p7 are bots
    const human = connect(room, "tok0");
    expect([...storage.data.keys()].filter((k) => k.startsWith("input:"))).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1600);
    const inputs = [...storage.data].filter(([k]) => k.startsWith("input:")).map(([, v]) => v as { input: { by: string } });
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((i) => i.input.by !== "p0")).toBe(true);
    expect(lastView(human).players.filter((p) => p.isBot)).toHaveLength(7);
    vi.useRealTimers();
  });
});
