import { SEAT_COUNT, type MatchmakerServerMessage, type Seat } from "@mush2/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeConnection, FakeServer, FakeStorage } from "./testing/fakes.ts";

const setups: { roomId: string; seats: Seat[]; tokens: Record<string, string> }[] = [];

vi.mock("partyserver", () => ({
  Server: FakeServer,
  getServerByName: async (_ns: unknown, roomId: string) => ({
    setup: async (seats: Seat[], tokens: Record<string, string>) => void setups.push({ roomId, seats, tokens }),
  }),
}));
const { Matchmaker } = await import("./Matchmaker.ts");

type Conn = FakeConnection<{ name: string | null; joinedAt: number }>;

let storage: FakeStorage;
let mm: InstanceType<typeof Matchmaker>;
let n = 0;

beforeEach(() => {
  setups.length = 0;
  storage = new FakeStorage();
  mm = new Matchmaker({ storage } as never, { GameRoom: {} } as never);
});

function join(name: string | null): Conn {
  const conn: Conn = new FakeConnection(`c${n++}`);
  (mm as unknown as FakeServer).connections.add(conn as never);
  if (name !== null) void queue(conn, name);
  return conn;
}
const queue = (c: Conn, name: string) => mm.onMessage(c as never, JSON.stringify({ type: "queue", name }));
const msgs = (c: Conn) => c.messages<MatchmakerServerMessage>();
const matched = (c: Conn) => msgs(c).find((m) => m.type === "matched") as { roomId: string; token: string } | undefined;

describe("Matchmaker queue", () => {
  it("reports the queue size and arms the fill timer for the first player", async () => {
    const a = join(null);
    await queue(a, "Ann");
    expect(msgs(a).at(-1)).toEqual({ type: "queued", waiting: 1, seats: SEAT_COUNT });
    expect(storage.alarm).not.toBeNull();
    const b = join(null);
    const alarm = storage.alarm;
    await queue(b, "Bob");
    expect(storage.alarm).toBe(alarm); // not pushed back by later joiners
    expect(msgs(a).at(-1)).toMatchObject({ waiting: 2 });
  });

  it("rejects malformed messages and ignores a second queue request", async () => {
    const a = join(null);
    await mm.onMessage(a as never, "{}");
    expect(msgs(a).at(-1)).toEqual({ type: "error", message: "Malformed message" });
    await queue(a, "Ann");
    await queue(a, "Other");
    expect((a.state as { name: string }).name).toBe("Ann");
  });

  it("cancels the fill timer when the queue empties", async () => {
    const a = join(null);
    await queue(a, "Ann");
    (mm as unknown as FakeServer).connections.delete(a as never);
    await mm.onClose(a as never);
    expect(storage.alarm).toBeNull();
  });
});

describe("Matchmaker starting a match", () => {
  it("starts immediately with no bots when the ship is full", async () => {
    const conns = Array.from({ length: SEAT_COUNT }, () => join(null));
    for (const c of conns) await queue(c, `P${c.id}`);
    expect(setups).toHaveLength(1);
    expect(setups[0]!.seats.every((s) => !s.isBot)).toBe(true);
    expect(conns.every((c) => matched(c))).toBe(true);
  });

  it("fills the empty seats with bots when the timer fires, labeled as AI", async () => {
    const a = join(null);
    await queue(a, "Ann");
    await mm.onAlarm();
    const { seats } = setups[0]!;
    expect(seats).toHaveLength(SEAT_COUNT);
    expect(seats.filter((s) => !s.isBot).map((s) => s.name)).toEqual(["Ann"]);
    for (const bot of seats.filter((s) => s.isBot)) expect(bot.name).toMatch(/\(AI\)$/);
    expect(new Set(seats.map((s) => s.id)).size).toBe(SEAT_COUNT);
    expect(new Set(seats.map((s) => s.character)).size).toBe(SEAT_COUNT);
  });

  it("hands each human only their own token, which maps to their own seat", async () => {
    const [a, b] = [join(null), join(null)];
    await queue(a, "Ann");
    await queue(b, "Bob");
    await mm.onAlarm();
    const { tokens, seats, roomId } = setups[0]!;
    const [ta, tb] = [matched(a)!, matched(b)!];
    expect(ta.roomId).toBe(roomId);
    expect(ta.token).not.toBe(tb.token);
    expect(Object.keys(tokens).sort()).toEqual([ta.token, tb.token].sort()); // no tokens for bots
    expect(seats.find((s) => s.id === tokens[ta.token])!.name).toBe("Ann");
    expect(seats.find((s) => s.id === tokens[tb.token])!.name).toBe("Bob");
    expect(a.sent.join()).not.toContain(tb.token);
    expect(b.sent.join()).not.toContain(ta.token);
  });

  it("does not match the same players twice", async () => {
    const a = join(null);
    await queue(a, "Ann");
    await mm.onAlarm();
    await mm.onAlarm();
    expect(setups).toHaveLength(1);
  });

  it("seats the earliest joiners first when more are waiting than seats", async () => {
    const conns = Array.from({ length: SEAT_COUNT + 2 }, () => join(null));
    for (const c of conns) await queue(c, c.id);
    const late = conns.slice(SEAT_COUNT);
    expect(late.every((c) => !matched(c))).toBe(true);
    expect(msgs(late[0]!).at(-1)).toMatchObject({ type: "queued", waiting: 2 });
  });
});
