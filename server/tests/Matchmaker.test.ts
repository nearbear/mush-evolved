import { PRESELECTION, type MatchmakerServerMessage } from "@mush2/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JoinResult } from "../src/GameRoom.ts";
import { FakeConnection, FakeServer, FakeStorage } from "../src/testing/fakes.ts";

/** Stand-in game rooms: each takes crew until full or closed, like GameRoom.join over the rules. */
interface FakeShip {
  crew: { name: string; character: string }[];
  closed: boolean;
}
const ships = new Map<string, FakeShip>();
/** Single-player games launched, by room id. */
const solos = new Map<string, { name: string; character: string }>();
const CLOSES_AT = Date.now() + 3_600_000;
/** The fake ships' seat count. */
const SEATS = 4;

vi.mock("partyserver", () => ({
  Server: FakeServer,
  getServerByName: async (_ns: unknown, roomId: string) => ({
    join: async (name: string, character: string): Promise<JoinResult> => {
      const ship = ships.get(roomId) ?? { crew: [], closed: false };
      ships.set(roomId, ship);
      if (ship.closed || ship.crew.length >= SEATS) return { ok: false, error: "ship_closed" };
      if (ship.crew.some((c) => c.character === character)) return { ok: false, error: "character_taken" };
      ship.crew.push({ name, character });
      const full = ship.crew.length >= SEATS;
      return { ok: true, token: `${roomId}:${name}`, aboard: ship.crew.length, seats: SEATS, taken: ship.crew.map((c) => c.character), closesAt: full ? null : CLOSES_AT };
    },
    status: async () => {
      const ship = ships.get(roomId)!;
      return { aboard: ship.crew.length, seats: SEATS, taken: ship.crew.map((c) => c.character), closesAt: CLOSES_AT };
    },
    setupSinglePlayer: async (name: string, character: string): Promise<string> => {
      if (solos.has(roomId) || ships.has(roomId)) throw new Error("Game already set up");
      solos.set(roomId, { name, character });
      return `${roomId}:solo`;
    },
  }),
}));
const { Matchmaker } = await import("../src/Matchmaker.ts");

type Conn = FakeConnection<{ joined: boolean }>;

let storage: FakeStorage;
let mm: InstanceType<typeof Matchmaker>;
let n = 0;
const CHARS = ["chao", "chun", "eleesha", "finola", "frieda", "gioele", "hua", "ian", "janice", "jinsu"];

beforeEach(async () => {
  ships.clear();
  solos.clear();
  storage = new FakeStorage();
  mm = new Matchmaker({ storage } as never, { GameRoom: {} } as never);
  await mm.onStart();
});

function connect(): Conn {
  const conn: Conn = new FakeConnection(`c${n++}`);
  (mm as unknown as FakeServer).connections.add(conn as never);
  return conn;
}
const queue = (c: Conn, name: string, character: string) => mm.onMessage(c as never, JSON.stringify({ type: "queue", name, character }));
const msgs = (c: Conn) => c.messages<MatchmakerServerMessage>();
const matched = (c: Conn) => msgs(c).find((m) => m.type === "matched") as { roomId: string; token: string } | undefined;
/** Boards `count` players with distinct characters; returns their connections. */
async function board(count: number, from = 0): Promise<Conn[]> {
  const conns = Array.from({ length: count }, connect);
  for (const [i, c] of conns.entries()) await queue(c, `P${from + i}`, CHARS[from + i]!);
  return conns;
}

describe("Matchmaker joining", () => {
  it("boards the first player at once, on a newly launched ship, with no bots", async () => {
    const [a] = await board(1);
    const m = matched(a!)!;
    expect(ships.get(m.roomId)!.crew).toEqual([{ name: "P0", character: "chao" }]);
    expect(msgs(a!).at(-1)).toEqual({ type: "queued", waiting: 1, seats: SEATS, taken: [expect.any(String)] });
    expect(storage.alarm).toBe(CLOSES_AT);
  });

  it("puts later players on the same open ship and tells watchers how many are aboard", async () => {
    const watcher = connect();
    const [a, b] = await board(2);
    expect(matched(b!)!.roomId).toBe(matched(a!)!.roomId);
    expect(msgs(watcher).at(-1)).toEqual({ type: "queued", waiting: 2, seats: SEATS, taken: [expect.any(String), expect.any(String)] });
  });

  it("starts a new ship once the open one is full", async () => {
    const first = await board(SEATS);
    const roomId = matched(first[0]!)!.roomId;
    expect(first.every((c) => matched(c)?.roomId === roomId)).toBe(true);
    // No ship open: a new one launches with the standard seats.
    expect(msgs(first[0]!).at(-1)).toMatchObject({ waiting: 0, seats: PRESELECTION.seats });
    expect(storage.alarm).toBeNull();
    const [late] = await board(1, SEATS);
    expect(matched(late!)!.roomId).not.toBe(roomId);
  });

  it("refuses a character someone aboard has, and lets them pick again", async () => {
    await board(1);
    const b = connect();
    await queue(b, "Bob", "chao");
    expect(msgs(b).at(-1)).toEqual({ type: "characterTaken" });
    expect(matched(b)).toBeUndefined();
    await queue(b, "Bob", "kuanti");
    expect(matched(b)).toBeDefined();
  });

  it("launches a new ship when the open one has closed (its deadline passed)", async () => {
    const [a] = await board(1);
    ships.get(matched(a!)!.roomId)!.closed = true;
    const [b] = await board(1, 1);
    expect(matched(b!)!.roomId).not.toBe(matched(a!)!.roomId);
  });

  it("forgets the open ship when its deadline alarm fires", async () => {
    const watcher = connect();
    await board(1);
    vi.useFakeTimers({ now: CLOSES_AT });
    try {
      await mm.onAlarm();
    } finally {
      vi.useRealTimers();
    }
    expect(msgs(watcher).at(-1)).toMatchObject({ waiting: 0 });
    expect(await storage.get("open")).toBeUndefined();
  });

  it("remembers the open ship across a restart", async () => {
    const [a] = await board(1);
    mm = new Matchmaker({ storage } as never, { GameRoom: {} } as never);
    await mm.onStart();
    const [b] = await board(1, 1);
    expect(matched(b!)!.roomId).toBe(matched(a!)!.roomId);
  });

  it("asks a ship stored before `seats` existed for its seat count", async () => {
    await board(1);
    const { seats: _, ...old } = (await storage.get<{ seats: number }>("open"))!;
    await storage.put("open", old);
    mm = new Matchmaker({ storage } as never, { GameRoom: {} } as never);
    await mm.onStart();
    expect(await storage.get("open")).toMatchObject({ seats: SEATS });
    const watcher = connect();
    await board(1, 1);
    expect(msgs(watcher).at(-1)).toMatchObject({ waiting: 2, seats: SEATS });
  });

  it("rejects malformed messages and ignores a second request on the same connection", async () => {
    const a = connect();
    await mm.onMessage(a as never, "{}");
    expect(msgs(a).at(-1)).toEqual({ type: "error", message: "malformed_message" });
    await queue(a, "Ann", "chao");
    await queue(a, "Ann", "kuanti");
    expect([...ships.values()].flatMap((s) => s.crew)).toHaveLength(1);
  });

  it("rejects an unknown character", async () => {
    const a = connect();
    await queue(a, "Ann", "nobody");
    expect(msgs(a).at(-1)).toEqual({ type: "error", message: "malformed_message" });
  });

  it("boards simultaneous joiners one at a time, onto one ship", async () => {
    const conns = Array.from({ length: 3 }, connect);
    await Promise.all(conns.map((c, i) => queue(c, `P${i}`, CHARS[i]!)));
    expect(new Set(conns.map((c) => matched(c)!.roomId)).size).toBe(1);
  });

  it("hands each player only their own token", async () => {
    const [a, b] = await board(2);
    expect(a!.sent.join()).not.toContain(matched(b!)!.token);
    expect(b!.sent.join()).not.toContain(matched(a!)!.token);
  });
});

describe("Matchmaker single player", () => {
  const solo = (c: Conn, name: string, character: string) => mm.onMessage(c as never, JSON.stringify({ type: "singlePlayer", name, character }));

  it("launches a new game per player, outside the queue, with any character", async () => {
    const [a, b] = [connect(), connect()];
    await solo(a, "A", "chun");
    await solo(b, "B", "chun");
    const [ma, mb] = [matched(a)!, matched(b)!];
    expect(ma.roomId).not.toBe(mb.roomId);
    expect(ma.token).toBe(`${ma.roomId}:solo`);
    expect(solos.get(ma.roomId)).toEqual({ name: "A", character: "chun" });
    // The multiplayer queue is untouched: the next joiner launches a fresh ship.
    expect(ships.size).toBe(0);
    const [p] = await board(1);
    expect(matched(p!)!.roomId).not.toBe(ma.roomId);
  });

  it("launches once per connection", async () => {
    const c = connect();
    await solo(c, "A", "ian");
    await solo(c, "A", "ian");
    expect(solos.size).toBe(1);
  });
});
