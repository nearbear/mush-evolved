import {
  CHAT_CHANNELS,
  STATE_VERSION,
  legalIn,
  rebuildGame,
  resolveConfig,
  STANDARD_SETUP,
  type ConfigOverrides,
  type GameState,
  type GameSetup,
  type RecordedInput,
} from "@mush2/shared";
import { describe, expect, it, vi } from "vitest";
import { AccountStore } from "../src/accountStore.ts";
import { GameStore } from "../src/gameStore.ts";
import { ShipStore } from "../src/shipStore.ts";
import { sweepRunning } from "../src/shipSweep.ts";
import { FakeR2Bucket, FakeServer, FakeStorage, seats, tokensFor } from "../src/testing/fakes.ts";
import { migratedDatabase } from "./sqliteD1.ts";
import {
  GameRoom,
  asRoom,
  newRoom,
  connect,
  send,
  lastMsg,
  lastView,
} from "./gameRoomHarness.ts";

// Mocked before the harness imports GameRoom, so the room extends the fake server.
vi.mock("partyserver", () => ({ Server: FakeServer }));

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

describe("GameRoom running ships (#431)", () => {
  type Shipping = { recordingShip: Promise<void> | null; recordFinished(): Promise<void>; game: GameState; env: Record<string, unknown> };
  type ShipDbRow = { room_id: string; language: string | null; single_player: number; seats: number; launched_at: number };
  const shipRows = async (db: ReturnType<typeof migratedDatabase>) => (await db.prepare("SELECT * FROM ships").all<ShipDbRow>()).results;
  const gameRows = async (db: ReturnType<typeof migratedDatabase>) => (await db.prepare("SELECT room_id FROM games").all()).results;
  const endGame = (inner: Shipping) => {
    inner.game.phase = "ended";
    inner.game.winner = "humans";
    inner.game.ending = "sol";
  };

  /** A room on this D1, or none (`null`), so the launch write fails. */
  const shipRoom = (db: ReturnType<typeof migratedDatabase> | null, storage = new FakeStorage()) => {
    const room = new GameRoom({ storage } as never, { RULES_VERSION: "test", REPLAYS: new FakeR2Bucket(), ...(db && { DB: db }) } as never);
    return { room, storage, inner: room as unknown as Shipping };
  };

  it("writes a row when a multiplayer ship launches, with no player information", async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 14, 10) });
    try {
      const db = migratedDatabase();
      const { room, inner } = shipRoom(db);
      expect(room.running()).toBe(false);
      await room.join("Ann", "chun", STANDARD_SETUP, undefined, "fr");
      await inner.recordingShip;
      expect(await shipRows(db)).toEqual([
        { room_id: (room as unknown as { name: string }).name, language: "fr", single_player: 0, seats: inner.game.config.preselection!.seats, launched_at: Date.now() },
      ]);
      expect(room.running()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries a failed write from the alarm, and the end of the game removes the row with the games row", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { room, inner, storage } = shipRoom(null);
      await room.setup(seats(3), tokensFor(3));
      await inner.recordingShip;
      // No D1: the write failed and the alarm is set to try again, before the next cycle.
      const retryAt = storage.alarm!;
      expect(retryAt).toBe(1_000_000 + 60_000);
      const db = migratedDatabase();
      inner.env.DB = db;
      vi.setSystemTime(retryAt);
      await room.onAlarm();
      expect((await shipRows(db)).map((r) => r.seats)).toEqual([inner.game.players.length]);
      expect(storage.alarm).not.toBe(retryAt);
      endGame(inner);
      await inner.recordFinished();
      expect(await shipRows(db)).toEqual([]);
      expect(await gameRows(db)).toHaveLength(1);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it("writes nothing on a retry once the game has ended", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { room, inner, storage } = shipRoom(null);
      await room.setup(seats(3), tokensFor(3));
      await inner.recordingShip;
      const db = migratedDatabase();
      inner.env.DB = db;
      endGame(inner);
      await inner.recordFinished();
      vi.setSystemTime(1_000_000 + 60_000);
      await room.onAlarm();
      expect(await shipRows(db)).toEqual([]);
      expect(await gameRows(db)).toHaveLength(1);
      expect(storage.alarm).toBeNull();
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it("writes a row for a single-player game without an account, and removes it at the end with no games row", async () => {
    const db = migratedDatabase();
    const { room, inner } = shipRoom(db);
    await room.setupSinglePlayer("Solo", "chun", "es");
    await inner.recordingShip;
    expect(await shipRows(db)).toMatchObject([{ language: "es", single_player: 1, seats: inner.game.players.length }]);
    endGame(inner);
    await inner.recordFinished();
    expect(await shipRows(db)).toEqual([]);
    expect(await gameRows(db)).toEqual([]);
  });

  it("writes the row again on restart if it wasn't saved as written, which changes nothing", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      const db = migratedDatabase();
      const { room, inner, storage } = shipRoom(db);
      await room.setup(seats(3), tokensFor(3));
      await inner.recordingShip;
      // Saved with the next input only, so a restart before one writes it again.
      expect((storage.data.get("game") as { shipRecorded: boolean }).shipRecorded).toBe(false);
      const revived = shipRoom(db, storage);
      await revived.room.onStart();
      expect(storage.alarm).toBe(1_000_000);
      await revived.room.onAlarm();
      expect(await shipRows(db)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says a retired ship isn't running, so the sweep removes its row", async () => {
    const db = migratedDatabase();
    const { room, storage, inner } = shipRoom(db);
    await room.setup(seats(3), tokensFor(3));
    await inner.recordingShip;
    (storage.data.get("game") as { version: number }).version = -1;
    const retired = shipRoom(db, storage).room;
    await retired.onStart();
    expect(retired.running()).toBe(false);
    expect(await sweepRunning(new ShipStore(db), async () => retired.running())).toBe(1);
    expect(await shipRows(db)).toEqual([]);
  });
});
