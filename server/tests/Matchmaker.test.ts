import { PRESELECTION, type MatchmakerServerMessage } from "@mush2/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore } from "../src/accountStore.ts";
import type { JoinResult, SeatAccount } from "../src/GameRoom.ts";
import { FakeConnection, FakeServer, FakeStorage } from "../src/testing/fakes.ts";
import { migratedDatabase } from "./sqliteD1.ts";

/** Stand-in game rooms: each takes crew until full or closed, like GameRoom.join over the rules. */
interface FakeShip {
  crew: { name: string; character: string; accountId?: string; dead?: boolean }[];
  closed: boolean;
  /** The game is over (or the ship retired): nobody is aboard any more. */
  ended?: boolean;
  /** Resume tokens handed out, by session key. */
  resumed?: string[];
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
    join: async (name: string, character: string, _setup: unknown, account?: SeatAccount): Promise<JoinResult> => {
      const ship = ships.get(roomId) ?? { crew: [], closed: false };
      ships.set(roomId, ship);
      if (ship.closed || ship.crew.length >= SEATS) return { ok: false, error: "ship_closed" };
      if (ship.crew.some((c) => c.character === character)) return { ok: false, error: "character_taken" };
      ship.crew.push({ name, character, accountId: account?.accountId });
      const full = ship.crew.length >= SEATS;
      return { ok: true, token: `${roomId}:${name}`, aboard: ship.crew.length, seats: SEATS, taken: ship.crew.map((c) => c.character), closesAt: full ? null : CLOSES_AT };
    },
    status: async () => {
      const ship = ships.get(roomId)!;
      return { aboard: ship.crew.length, seats: SEATS, taken: ship.crew.map((c) => c.character), closesAt: CLOSES_AT };
    },
    resume: async (accountId: string, sessionKey: string) => {
      const ship = ships.get(roomId);
      const seat = ship && !ship.ended && ship.crew.find((c) => c.accountId === accountId && !c.dead);
      if (!seat) return { ok: false };
      ship.resumed = [...(ship.resumed ?? []), sessionKey];
      return { ok: true, token: `${roomId}:resumed:${seat.name}` };
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
let store: AccountStore;
let env: { GameRoom: object; DB: unknown };
let mm: InstanceType<typeof Matchmaker>;
let n = 0;
const CHARS = ["chao", "chun", "eleesha", "finola", "frieda", "gioele", "hua", "ian", "janice", "jinsu"];

beforeEach(async () => {
  ships.clear();
  solos.clear();
  n = 0;
  storage = new FakeStorage();
  const db = migratedDatabase();
  store = new AccountStore(db);
  env = { GameRoom: {}, DB: db };
  mm = new Matchmaker({ storage } as never, env as never);
  (mm as unknown as { name: string }).name = "en";
  await mm.onStart();
});

/** A signed-in player's session cookie, for an account named `name` (made the first time). */
async function signIn(name: string): Promise<{ accountId: string; cookie: string }> {
  const created = await store.createAccount(name, "dev", name.toLowerCase(), Date.now());
  const accountId = created.ok ? created.account.id : (await store.findAccountByIdentity("dev", name.toLowerCase()))!.id;
  const sessionId = await store.createSession(accountId, Date.now() + 3_600_000);
  return { accountId, cookie: `__Host-mush2_session=${sessionId}` };
}

/** Opens a socket, signed in to the account named `as` (default `P<n>`), or signed out with `as: null`. */
async function connectAs(as: string | null, room: InstanceType<typeof Matchmaker> = mm): Promise<Conn> {
  const conn: Conn = new FakeConnection(`c${n++}`);
  (room as unknown as FakeServer).connections.add(conn as never);
  const headers = as === null ? {} : { Cookie: (await signIn(as)).cookie };
  await room.onConnect(conn as never, { request: new Request("https://mush.test/parties/matchmaker/en", { headers }) } as never);
  return conn;
}

const connect = (): Promise<Conn> => connectAs(`P${n}`);
const queue = (c: Conn, name: string, character: string) => mm.onMessage(c as never, JSON.stringify({ type: "queue", name, character }));
const msgs = (c: Conn) => c.messages<MatchmakerServerMessage>();
const matched = (c: Conn) => msgs(c).find((m) => m.type === "matched") as { roomId: string; token: string } | undefined;
/** Boards `count` players with distinct characters; returns their connections. */
async function board(count: number, from = 0): Promise<Conn[]> {
  const conns: Conn[] = [];
  for (let i = 0; i < count; i++) conns.push(await connectAs(`P${from + i}`));
  for (const [i, c] of conns.entries()) await queue(c, `P${from + i}`, CHARS[from + i]!);
  return conns;
}

describe("Matchmaker joining", () => {
  it("boards the first player at once, on a newly launched ship, with no bots", async () => {
    const [a] = await board(1);
    const m = matched(a!)!;
    expect(ships.get(m.roomId)!.crew).toEqual([{ name: "P0", character: "chao", accountId: expect.any(String) }]);
    expect(msgs(a!).at(-1)).toEqual({ type: "queued", waiting: 1, seats: SEATS, taken: [expect.any(String)] });
    expect(storage.alarm).toBe(CLOSES_AT);
  });

  it("puts later players on the same open ship and tells watchers how many are aboard", async () => {
    const watcher = await connect();
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
    const b = await connect();
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
    const watcher = await connect();
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
    mm = new Matchmaker({ storage } as never, env as never);
    (mm as unknown as { name: string }).name = "en";
    await mm.onStart();
    const [b] = await board(1, 1);
    expect(matched(b!)!.roomId).toBe(matched(a!)!.roomId);
  });

  it("asks a ship stored before `seats` existed for its seat count", async () => {
    await board(1);
    const { seats: _, ...old } = (await storage.get<{ seats: number }>("open"))!;
    await storage.put("open", old);
    mm = new Matchmaker({ storage } as never, env as never);
    (mm as unknown as { name: string }).name = "en";
    await mm.onStart();
    expect(await storage.get("open")).toMatchObject({ seats: SEATS });
    const watcher = await connect();
    await board(1, 1);
    expect(msgs(watcher).at(-1)).toMatchObject({ waiting: 2, seats: SEATS });
  });

  it("rejects malformed messages and ignores a second request on the same connection", async () => {
    const a = await connect();
    await mm.onMessage(a as never, "{}");
    expect(msgs(a).at(-1)).toEqual({ type: "error", message: "malformed_message" });
    await queue(a, "Ann", "chao");
    await queue(a, "Ann", "kuanti");
    expect([...ships.values()].flatMap((s) => s.crew)).toHaveLength(1);
  });

  it("rejects an unknown character", async () => {
    const a = await connect();
    await queue(a, "Ann", "nobody");
    expect(msgs(a).at(-1)).toEqual({ type: "error", message: "malformed_message" });
  });

  it("boards simultaneous joiners one at a time, onto one ship", async () => {
    const conns = [await connect(), await connect(), await connect()];
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
    const [a, b] = [await connectAs(null), await connectAs(null)];
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
    const c = await connectAs(null);
    await solo(c, "A", "ian");
    await solo(c, "A", "ian");
    expect(solos.size).toBe(1);
  });
});

describe("Matchmaker accounts (#285)", () => {
  it("refuses multiplayer without an account, and takes the account's name over the one sent", async () => {
    const guest = await connectAs(null);
    await queue(guest, "Guest 1", "chao");
    expect(msgs(guest).at(-1)).toEqual({ type: "error", message: "sign_in_required" });
    expect(ships.size).toBe(0);

    const alice = await connectAs("Alice");
    await queue(alice, "Guest 1", "chao");
    const m = matched(alice)!;
    expect(ships.get(m.roomId)!.crew[0]).toMatchObject({ name: "Alice", accountId: expect.any(String) });
    expect(await store.currentShip(ships.get(m.roomId)!.crew[0]!.accountId!)).toBe(m.roomId);
  });

  it("refuses a session that ended after the socket opened", async () => {
    const conn: Conn = new FakeConnection("late");
    (mm as unknown as FakeServer).connections.add(conn as never);
    const { cookie } = await signIn("Alice");
    await mm.onConnect(conn as never, { request: new Request("https://mush.test/", { headers: { Cookie: cookie } }) } as never);
    await store.deleteSession(cookie.split("=")[1]!);
    await queue(conn, "x", "chao");
    expect(msgs(conn).at(-1)).toEqual({ type: "error", message: "sign_in_required" });
  });

  it("resumes the account's ship from another device instead of boarding a second one", async () => {
    const [first] = await board(1);
    const roomId = matched(first!)!.roomId;
    // Another device, and another language's matchmaker: D1 is shared.
    const fr = new Matchmaker({ storage: new FakeStorage() } as never, env as never);
    (fr as unknown as { name: string }).name = "fr";
    await fr.onStart();
    const phone = await connectAs("P0", fr);
    await fr.onMessage(phone as never, JSON.stringify({ type: "queue", name: "x", character: "kuanti" }));
    expect(matched(phone)).toEqual({ type: "matched", roomId, token: `${roomId}:resumed:P0` });
    expect(ships.get(roomId)!.crew).toHaveLength(1);
    expect(ships.size).toBe(1);
  });

  it("frees an account whose seat died or whose ship ended, so it boards a new ship", async () => {
    const [a, b] = await board(2);
    const roomId = matched(a!)!.roomId;
    ships.get(roomId)!.crew[0]!.dead = true;
    ships.get(roomId)!.closed = true;
    const again = await connectAs("P0");
    await queue(again, "x", "kuanti");
    expect(matched(again)!.roomId).not.toBe(roomId);

    ships.get(roomId)!.ended = true;
    const bAgain = await connectAs("P1");
    await queue(bAgain, "x", "hua");
    expect(matched(bAgain)!.roomId).not.toBe(roomId);
    expect(matched(b!)!.roomId).toBe(roomId);
  });

  it("closes its D1 row when the seat is refused, so the account isn't stuck", async () => {
    await board(1);
    const b = await connectAs("Bob");
    await queue(b, "x", "chao");
    expect(msgs(b).at(-1)).toEqual({ type: "characterTaken" });
    const bob = (await store.findAccountByIdentity("dev", "bob"))!;
    expect(await store.currentShip(bob.id)).toBeNull();
    // Never seated, so no history row either: logout revokes on the newest ship, which must be a real one.
    expect(await store.ships(bob.id)).toEqual([]);
    await queue(b, "x", "kuanti");
    expect(await store.currentShip(bob.id)).toBe(matched(b)!.roomId);
  });

  it("sends a join to the ship D1 says the account is aboard, wherever it was boarded", async () => {
    const a = await connectAs("Alice");
    const alice = (await store.findAccountByIdentity("dev", "alice"))!;
    // Boarded from another tab, on a ship this matchmaker never heard of.
    await store.boardShip(alice.id, "elsewhere", Date.now());
    ships.set("elsewhere", { crew: [{ name: "Alice", character: "chao", accountId: alice.id }], closed: false });
    await queue(a, "x", "hua");
    expect(matched(a)).toEqual({ type: "matched", roomId: "elsewhere", token: "elsewhere:resumed:Alice" });
  });

  it("answers join_failed and lets the socket retry when D1 throws", async () => {
    const a = await connectAs("Alice");
    vi.spyOn(AccountStore.prototype, "currentShip").mockRejectedValueOnce(new Error("D1 down"));
    vi.spyOn(console, "warn").mockImplementationOnce(() => {});
    await queue(a, "x", "hua");
    expect(msgs(a).at(-1)).toEqual({ type: "error", message: "join_failed" });
    await queue(a, "x", "hua");
    expect(matched(a)).toBeDefined();
  });

  it("refuses a join when another tab boards between the check and the D1 write", async () => {
    const a = await connectAs("Alice");
    const alice = (await store.findAccountByIdentity("dev", "alice"))!;
    await store.boardShip(alice.id, "elsewhere", Date.now());
    // The check ran before the other tab's row existed.
    vi.spyOn(AccountStore.prototype, "currentShip").mockResolvedValueOnce(null);
    await queue(a, "x", "hua");
    expect(msgs(a).at(-1)).toEqual({ type: "error", message: "already_aboard" });
    expect(ships.size).toBe(0);
    // The connection may try again.
    await queue(a, "x", "hua");
    expect(msgs(a).at(-1)).not.toEqual({ type: "error", message: "already_aboard" });
  });
});

describe("Matchmaker resume (#320)", () => {
  const resume = (c: Conn, room: InstanceType<typeof Matchmaker> = mm) => room.onMessage(c as never, JSON.stringify({ type: "resume" }));

  it("takes the account back to its ship, from any language's matchmaker, with no character", async () => {
    const [first] = await board(1);
    const roomId = matched(first!)!.roomId;
    const es = new Matchmaker({ storage: new FakeStorage() } as never, env as never);
    (es as unknown as { name: string }).name = "es";
    await es.onStart();
    const phone = await connectAs("P0", es);
    await resume(phone, es);
    expect(matched(phone)).toEqual({ type: "matched", roomId, token: `${roomId}:resumed:P0` });
    expect(ships.get(roomId)!.crew).toHaveLength(1);
  });

  it("answers not_aboard when the account has no ship, boarding nothing", async () => {
    const a = await connectAs("Alice");
    await resume(a);
    expect(msgs(a).at(-1)).toEqual({ type: "error", message: "not_aboard" });
    expect(ships.size).toBe(0);
    // The socket may join a ship afterwards.
    await queue(a, "x", "hua");
    expect(matched(a)).toBeDefined();
  });

  it("answers not_aboard and closes the row when the ship says the account isn't aboard", async () => {
    const [a] = await board(1);
    const roomId = matched(a!)!.roomId;
    ships.get(roomId)!.ended = true;
    const again = await connectAs("P0");
    await resume(again);
    expect(msgs(again).at(-1)).toEqual({ type: "error", message: "not_aboard" });
    const p0 = (await store.findAccountByIdentity("dev", "p0"))!;
    expect(await store.currentShip(p0.id)).toBeNull();
  });

  it("refuses a socket without an account", async () => {
    const guest = await connectAs(null);
    await resume(guest);
    expect(msgs(guest).at(-1)).toEqual({ type: "error", message: "sign_in_required" });
  });

  it("answers join_failed and lets the socket retry when D1 throws", async () => {
    await board(1);
    const again = await connectAs("P0");
    vi.spyOn(AccountStore.prototype, "currentShip").mockRejectedValueOnce(new Error("D1 down"));
    vi.spyOn(console, "warn").mockImplementationOnce(() => {});
    await resume(again);
    expect(msgs(again).at(-1)).toEqual({ type: "error", message: "join_failed" });
    await resume(again);
    expect(matched(again)).toBeDefined();
  });
});
