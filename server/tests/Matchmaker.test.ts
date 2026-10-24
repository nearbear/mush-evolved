import { SEAT_COUNT, type MatchmakerServerMessage } from "@mush2/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JoinResult } from "../src/GameRoom.ts";
import { FakeConnection, FakeServer, FakeStorage } from "../src/testing/fakes.ts";

/** Stand-in game rooms: each takes crew until full or closed, like GameRoom.join over the rules. */
interface FakeShip {
  crew: { name: string; character: string }[];
  closed: boolean;
}
const ships = new Map<string, FakeShip>();
const CLOSES_AT = Date.now() + 3_600_000;

vi.mock("partyserver", () => ({
  Server: FakeServer,
  getServerByName: async (_ns: unknown, roomId: string) => ({
    join: async (name: string, character: string): Promise<JoinResult> => {
      const ship = ships.get(roomId) ?? { crew: [], closed: false };
      ships.set(roomId, ship);
      if (ship.closed || ship.crew.length >= SEAT_COUNT) return { ok: false, error: "ship_closed" };
      if (ship.crew.some((c) => c.character === character)) return { ok: false, error: "character_taken" };
      ship.crew.push({ name, character });
      const full = ship.crew.length >= SEAT_COUNT;
      return { ok: true, token: `${roomId}:${name}`, aboard: ship.crew.length, closesAt: full ? null : CLOSES_AT };
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
    expect(msgs(a!).at(-1)).toEqual({ type: "queued", waiting: 1, seats: SEAT_COUNT });
    expect(storage.alarm).toBe(CLOSES_AT);
  });

  it("puts later players on the same open ship and tells watchers how many are aboard", async () => {
    const watcher = connect();
    const [a, b] = await board(2);
    expect(matched(b!)!.roomId).toBe(matched(a!)!.roomId);
    expect(msgs(watcher).at(-1)).toEqual({ type: "queued", waiting: 2, seats: SEAT_COUNT });
  });

  it("starts a new ship once the open one is full", async () => {
    const first = await board(SEAT_COUNT);
    const roomId = matched(first[0]!)!.roomId;
    expect(first.every((c) => matched(c)?.roomId === roomId)).toBe(true);
    expect(msgs(first[0]!).at(-1)).toMatchObject({ waiting: 0 });
    expect(storage.alarm).toBeNull();
    const [late] = await board(1, SEAT_COUNT);
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
