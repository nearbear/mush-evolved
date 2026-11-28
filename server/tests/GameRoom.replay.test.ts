import {
  CHAT_CHANNELS,
  MUSH_CHANNEL,
  type ChannelId,
  type ChatMessage,
  fullViewFor,
  HISTORY_VERSION,
  legalIn,
  rebuildHistory,
  replayKeys,
  STANDARD_SETUP,
  type GameServerMessage,
  type GameState,
  type GameSetup,
  type ChunkEntry,
  type FullView,
  type ReplayIndex,
  type ReplayModeration,
  type RecordedInput,
  type SeatStarts,
} from "@mush2/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStore } from "../src/accountStore.ts";
import { GameStore } from "../src/gameStore.ts";
import { FakeR2Bucket, FakeServer, FakeStorage, seats, tokensFor } from "../src/testing/fakes.ts";
import { migratedDatabase } from "./sqliteD1.ts";
import {
  GameRoom,
  RECLAIM_DELAY_MS,
  type Conn,
  type Room,
  asRoom,
  newRoom,
  connect,
  CHEATS,
  expectHistory,
  send,
  lastView,
  gameOf,
} from "./gameRoomHarness.ts";

// Mocked before the harness imports GameRoom, so the room extends the fake server.
vi.mock("partyserver", () => ({ Server: FakeServer }));

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
    expect(bucket.puts, "written once").toBe(index.chunks.length + 2);
    const inputs = (await storage.list({ prefix: "input:" })).size;
    expect(index.chunks.reduce((n, c) => n + c.inputs, 0)).toBe(inputs);
    const chunk = bucket.objects.get(replayKeys.chunk("test-room", 1))!;
    expect(chunk.httpMetadata).toEqual({ contentType: "application/json", contentEncoding: "gzip" });
    const entries = await bucket.json<ChunkEntry[]>(replayKeys.chunk("test-room", 1));
    expect(rebuildHistory(entries.map((e) => e.history)).at(-1)!.view).toEqual(last);
    // Each entry is only its time and history: no input, raw text or chat id.
    for (const e of entries) expect(Object.keys(e).sort()).toEqual(["at", "history"]);
    expect(await bucket.json<ReplayModeration>(replayKeys.moderation("test-room"))).toEqual({
      v: HISTORY_VERSION,
      roomId: "test-room",
      raw: {},
      rawByInput: {},
      blocked: [],
      rateLimited: {},
    });
  });

  it("retries a failed copy from the alarm, and isn't ready until every chunk, moderation.json, and the index are written", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const bucket = new FakeR2Bucket();
    const { room, inner, storage } = await endedRoom(bucket);
    // The first chunk goes, the second fails: no index, not ready, a retry on the alarm.
    bucket.failAfter = 1;
    await inner.copyReplay();
    expect(ready(storage)).toBe(false);
    expect(bucket.objects.has(replayKeys.index("test-room"))).toBe(false);
    expect(storage.alarm).not.toBeNull();
    // Then only moderation.json fails: still no index, not ready.
    bucket.failAfter = bucket.puts + 2;
    vi.setSystemTime(storage.alarm!);
    await room.onAlarm();
    expect(ready(storage)).toBe(false);
    expect(bucket.objects.has(replayKeys.moderation("test-room"))).toBe(false);
    expect(bucket.objects.has(replayKeys.index("test-room"))).toBe(false);
    // Then only the index fails.
    bucket.failAfter = bucket.puts + 3;
    vi.setSystemTime(storage.alarm!);
    await room.onAlarm();
    expect(ready(storage)).toBe(false);
    expect(bucket.objects.has(replayKeys.moderation("test-room"))).toBe(true);
    expect(bucket.objects.has(replayKeys.index("test-room"))).toBe(false);
    bucket.failAfter = null;
    vi.setSystemTime(storage.alarm!);
    await room.onAlarm();
    expect(ready(storage)).toBe(true);
    expect(bucket.objects.has(replayKeys.index("test-room"))).toBe(true);
    expect((storage.data.get("game") as { replayReady: boolean }).replayReady).toBe(true);
  });

  it("copies moderator data (raw, rawByInput, blocked, rateLimited) to moderation.json without leaking it to chunks", async () => {
    vi.setSystemTime(Date.UTC(2026, 9, 19, 14));
    const storage = new FakeStorage();
    const bucket = new FakeR2Bucket();
    const room = asRoom(storage, CHEATS);
    (room as unknown as Copying).env.REPLAYS = bucket;
    await room.setup(seats(3), tokensFor(3), { p0: "mush" });
    const [c0, c1] = [connect(room, "tok0"), connect(room, "tok1")];
    // Filtered chat message (`raw` keyed by ChatMessage.id).
    await send(room, c0, { type: "chat", channel: CHAT_CHANNELS[0], text: "what the fuck" });
    const filteredMsg = lastView(c0).chat.at(-1)!;
    expect(filteredMsg.text).toBe("what the ****");
    // Filtered non-message input (`rawByInput` keyed by input seq).
    const threadSeq = (storage.data.get("game") as { inputs: number }).inputs;
    await send(room, c0, { type: "createThread", name: "see http://example.com" });
    // Blocked messages in order (also consumes 1 chat rate-limit token on p1).
    await send(room, c0, { type: "chat", channel: CHAT_CHANNELS[0], text: "   " });
    await send(room, c1, { type: "chat", channel: CHAT_CHANNELS[0], text: "x".repeat(301) });
    // 6 more messages on p1 (7 total within 10s against the 5-message limit -> 2 rejected).
    for (let i = 0; i < 6; i++) await send(room, c1, { type: "chat", channel: CHAT_CHANNELS[0], text: `msg ${i}` });

    const inner = room as unknown as Copying;
    inner.game.phase = "ended";
    inner.game.winner = "humans";
    inner.game.ending = "sol";
    await inner.persist();
    await inner.copyReplay();

    const chunkEntries = await bucket.json<ChunkEntry[]>(replayKeys.chunk("test-room", 0));
    const fullAfter = rebuildHistory(chunkEntries.map((e) => e.history)).at(-1)!.view;
    const replayChatId = fullAfter.chat.find((m) => m.text === "what the ****")!.id;
    expect(JSON.stringify(chunkEntries)).not.toContain("what the fuck");
    expect(JSON.stringify(chunkEntries)).not.toContain("http://example.com");

    const mod = await bucket.json<ReplayModeration>(replayKeys.moderation("test-room"));
    expect(mod).toMatchObject({
      v: HISTORY_VERSION,
      roomId: "test-room",
      raw: { [replayChatId]: "what the fuck" },
      rawByInput: { [threadSeq]: "see http://example.com" },
      rateLimited: { p1: 2 },
    });
    expect(mod.blocked).toEqual([
      expect.objectContaining({ by: "p0", type: "chat", raw: "   ", reason: "empty_message" }),
      expect.objectContaining({ by: "p1", type: "chat", raw: "x".repeat(301), reason: "message_too_long" }),
    ]);
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
    expect(a.messages<GameServerMessage>().map((m) => m.type)).toEqual(["build", "view", "chatRead", "logUnread", "notes"]);
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
    // Twelve read updates per 10 s, chat's and the room log's together: this one is the thirteenth, and would have
    // raised the count.
    await say(room, b, global);
    // Spread out, so the per-second limit on every message doesn't step in first.
    vi.useFakeTimers({ toFake: ["Date"] });
    const later = async (msg: Parameters<typeof send>[2]) => {
      vi.setSystemTime(Date.now() + 200);
      await send(room, a, msg);
    };
    for (let i = 0; i < 8; i++) await later({ type: "logRead", upTo: 0 });
    await later({ type: "chatRead", read: {} });
    await later({ type: "chatRead", read: { [global]: 2 } });
    vi.useRealTimers();
    expect(storage.data.get("chatRead:p0")).toEqual(stored);
    expect(a.messages<GameServerMessage>().slice(sent).some((m) => m.type !== "view")).toBe(false);
  });

  it("posting reads only the poster's own message: the count moves past it only when nothing older is unread (#513)", async () => {
    const { room, storage } = await newRoom();
    const [a, b] = [connect(room, "tok0"), connect(room, "tok1")];
    await say(room, b, global);
    // Message 0 is unread for p0: posting leaves the count alone, so message 0 stays unread.
    await say(room, a, global);
    expect(storage.data.has("chatRead:p0")).toBe(false);
    await send(room, a, { type: "chatRead", read: { [global]: 2 } });
    await say(room, b, global);
    await send(room, a, { type: "chatRead", read: { [global]: 3 } });
    // Everything before it read: the count moves past the new message, on every connection the seat has.
    await say(room, a, global);
    expect(storage.data.get("chatRead:p0")).toEqual({ [global]: 4 });
    expect(reads(a).at(-1)).toEqual({ type: "chatRead", read: { [global]: 4 } });
    // p1's first post was the channel's first message, so it read it; its second came after p0's unread one.
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

describe("GameRoom room log read state (#513)", () => {
  const unreads = (c: Conn) => c.messages<GameServerMessage>().filter((m) => m.type === "logUnread");
  /** Closes `c` as partyserver does: gone from the connections, then `onClose`. */
  const close = async (room: Room, c: Conn) => {
    (room as unknown as FakeServer).connections.delete(c as never);
    await room.onClose(c as never);
  };
  /** `n` more lines seen by `seat`'s body, as `pushLog` counts them. */
  const lines = (room: Room, seat: number, n: number) => {
    gameOf(room).players[seat]!.logSeen += n;
  };
  const seen = (room: Room, seat = 0) => gameOf(room).players[seat]!.logSeen;

  it("sends the lines missed while no connection was open, kept across a restart", async () => {
    const { room, storage } = await newRoom();
    const start = seen(room);
    const a = connect(room, "tok0");
    expect(unreads(a)).toEqual([{ type: "logUnread", from: start }]);
    lines(room, 0, 2); // seen live
    await close(room, a);
    expect(storage.data.get("logRead:p0")).toEqual({ body: "p0", readUpTo: start + 2, live: start + 2 });
    lines(room, 0, 3); // missed
    const revived = asRoom(storage);
    await revived.onStart();
    gameOf(revived).players[0]!.logSeen = start + 5;
    expect(unreads(connect(revived, "tok0"))).toEqual([{ type: "logUnread", from: start + 2 }]);
  });

  it("misses nothing while another connection is open", async () => {
    const { room } = await newRoom();
    const a = connect(room, "tok0", "a");
    const a2 = connect(room, "tok0", "a2");
    await close(room, a2);
    lines(room, 0, 3);
    expect(unreads(connect(room, "tok0", "a3"))).toEqual([{ type: "logUnread", from: seen(room) }]);
    expect(a.closed).toBeNull();
  });

  it("keeps older unread across a second offline stretch until it is read", async () => {
    const { room } = await newRoom();
    const start = seen(room);
    await close(room, connect(room, "tok0", "a"));
    lines(room, 0, 2);
    await close(room, connect(room, "tok0", "b"));
    lines(room, 0, 1);
    expect(unreads(connect(room, "tok0", "c"))).toEqual([{ type: "logUnread", from: start }]);
  });

  it("raises the point, clamped, and sends it to the seat's other connections only, never answering the sender", async () => {
    const { room, storage } = await newRoom();
    const start = seen(room);
    await close(room, connect(room, "tok0", "a"));
    lines(room, 0, 4);
    const [a, a2, b] = [connect(room, "tok0", "a"), connect(room, "tok0", "a2"), connect(room, "tok1", "b")];
    const [sentA, sentB] = [a.sent.length, b.sent.length];
    await send(room, a, { type: "logRead", upTo: start + 2 });
    expect(unreads(a2).at(-1)).toEqual({ type: "logUnread", from: start + 2 });
    expect(storage.data.get("logRead:p0")).toMatchObject({ readUpTo: start + 2 });
    await send(room, a, { type: "logRead", upTo: 9999 });
    expect(unreads(a2).at(-1)).toEqual({ type: "logUnread", from: start + 4 });
    // Not lowered, and no news is not sent.
    const before = a2.sent.length;
    await send(room, a, { type: "logRead", upTo: start });
    expect(a2.sent.length).toBe(before);
    expect(storage.data.get("logRead:p0")).toMatchObject({ readUpTo: start + 4 });
    expect(a.sent.length).toBe(sentA);
    expect(b.sent.length).toBe(sentB);
  });

  it("starts over with nothing unread when the seat's body changed (a Transfer)", async () => {
    const { room, storage } = await newRoom();
    await storage.put("logRead:p0", { body: "p1", readUpTo: 0, live: 0 });
    const revived = asRoom(storage);
    await revived.onStart();
    expect(unreads(connect(revived, "tok0"))).toEqual([{ type: "logUnread", from: seen(revived) }]);
    expect(storage.data.get("logRead:p0")).toMatchObject({ body: "p0", readUpTo: seen(revived) });
  });

  it("starts over for a Transfer while connected: nothing of the new body's past is unread, and the old point is gone", async () => {
    const { room, storage } = await newRoom(3, new FakeStorage(), {}, { p0: "mush", p1: "human" });
    const game = gameOf(room);
    const [mush, victim] = [game.players[0]!, game.players[1]!];
    mush.mushSkills.push("transfert");
    mush.room = victim.room = "LABORATORY";
    for (const o of game.players.slice(2)) o.room = "REFECTORY";
    game.contamination[victim.id] = 1;
    // The Mush seat has lines missed while offline, still unread.
    const start = seen(room);
    await close(room, connect(room, "tok0", "a"));
    lines(room, 0, 3);
    const a = connect(room, "tok0", "b");
    expect(unreads(a)).toEqual([{ type: "logUnread", from: start }]);
    await send(room, a, { type: "action", action: { type: "body_transfer", target: victim.id } });
    const body = gameOf(room).players.find((p) => p.mind === "p0")!;
    expect(body.id).toBe(victim.id);
    await close(room, a);
    expect(storage.data.get("logRead:p0")).toEqual({ body: body.id, readUpTo: body.logSeen, live: body.logSeen });
    expect(unreads(connect(room, "tok0", "c"))).toEqual([{ type: "logUnread", from: body.logSeen }]);
  });

  it("starts a seat with no record with nothing unread", async () => {
    const { room, storage } = await newRoom();
    lines(room, 0, 3);
    expect(unreads(connect(room, "tok0"))).toEqual([{ type: "logUnread", from: seen(room) }]);
    expect(storage.data.get("logRead:p0")).toMatchObject({ readUpTo: seen(room) });
  });

  it("keeps nothing for a bot seat", async () => {
    const { room, storage } = await newRoom();
    gameOf(room).players[1]!.isBot = true;
    const b = connect(room, "tok1");
    await send(room, b, { type: "logRead", upTo: 1 });
    await close(room, b);
    expect(unreads(b)).toEqual([]);
    expect(storage.data.has("logRead:p1")).toBe(false);
  });

  it("Leave ship deletes the seat's state", async () => {
    const { room, storage } = await newRoom(3, new FakeStorage(), CHEATS);
    const a = connect(room, "tok0");
    await close(room, connect(room, "tok0", "x"));
    await close(room, a);
    expect(storage.data.has("logRead:p0")).toBe(true);
    const c = connect(room, "tok0", "again");
    await send(room, c, { type: "leaveShip" });
    expect(storage.data.has("logRead:p0")).toBe(false);
  });
});

describe("GameRoom private notes (#503)", () => {
  const notesOf = (c: Conn) => c.messages<GameServerMessage>().filter((m) => m.type === "notes");
  const errors = (c: Conn) => c.messages<GameServerMessage>().filter((m) => m.type === "error");

  it("sends a connecting seat its notes after the view, as loaded on a restart", async () => {
    const { room, storage } = await newRoom();
    const a = connect(room, "tok0");
    expect(a.messages<GameServerMessage>().map((m) => m.type)).toEqual(["build", "view", "chatRead", "logUnread", "notes"]);
    expect(notesOf(a)).toEqual([{ type: "notes", notes: [] }]);
    await send(room, a, { type: "note", tab: 0, text: "Kuan Ti is Mush" });
    expect(storage.data.get("notes:p0")).toEqual([{ text: "Kuan Ti is Mush" }]);
    const revived = asRoom(storage);
    await revived.onStart();
    expect(notesOf(connect(revived, "tok0"))).toEqual([{ type: "notes", notes: [{ text: "Kuan Ti is Mush" }] }]);
  });

  it("sends a write to the seat's other connections only, never answering the sender", async () => {
    const { room } = await newRoom();
    const [a, a2, b] = [connect(room, "tok0", "a"), connect(room, "tok0", "a2"), connect(room, "tok1", "b")];
    const sentA = a.sent.length;
    await send(room, a, { type: "note", tab: 0, text: "secret" });
    await send(room, a, { type: "note", tab: 1, text: "two" });
    expect(notesOf(a2).at(-1)).toEqual({ type: "notes", notes: [{ text: "secret" }, { text: "two" }] });
    expect(a.sent.length).toBe(sentA);
    expect(notesOf(b)).toEqual([{ type: "notes", notes: [] }]);
    expect(JSON.stringify(b.sent)).not.toContain("secret");
    // Not in the game state, so never in a view or the record.
    expect(JSON.stringify(gameOf(room))).not.toContain("secret");
  });

  it("refuses a gap or a 17th tab, storing nothing", async () => {
    const { room, storage } = await newRoom();
    const a = connect(room, "tok0");
    await send(room, a, { type: "note", tab: 1, text: "gap" });
    expect(errors(a).at(-1)).toEqual({ type: "error", message: "note_refused" });
    expect(storage.data.has("notes:p0")).toBe(false);
    await storage.put("notes:p0", Array.from({ length: 16 }, () => ({ text: "" })));
    const revived = asRoom(storage);
    await revived.onStart();
    const again = connect(revived, "tok0");
    await send(revived, again, { type: "note", tab: 15, text: "last" });
    expect(errors(again)).toEqual([]);
    expect(storage.data.get("notes:p0")).toHaveLength(16);
  });

  it("keeps nothing for a bot seat", async () => {
    const { room, storage } = await newRoom();
    gameOf(room).players[1]!.isBot = true;
    const b = connect(room, "tok1");
    await send(room, b, { type: "note", tab: 0, text: "x" });
    expect(storage.data.has("notes:p1")).toBe(false);
    expect(notesOf(b)).toEqual([]);
  });

  it("follows the mind through a Transfer; the victim gets none of it", async () => {
    const { room, storage } = await newRoom(3, new FakeStorage(), {}, { p0: "mush", p1: "human" });
    const game = gameOf(room);
    const [mush, victim] = [game.players[0]!, game.players[1]!];
    mush.mushSkills.push("transfert");
    mush.room = victim.room = "LABORATORY";
    for (const o of game.players.slice(2)) o.room = "REFECTORY";
    game.contamination[victim.id] = 1;
    const [mushConn, victimConn] = [connect(room, "tok0"), connect(room, "tok1")];
    await send(room, mushConn, { type: "note", tab: 0, text: "plan" });
    await send(room, victimConn, { type: "note", tab: 0, text: "victim's" });
    await send(room, mushConn, { type: "action", action: { type: "body_transfer", target: victim.id } });
    const [again, victimAgain] = [connect(room, "tok0", "again"), connect(room, "tok1", "victim")];
    expect(notesOf(again)).toEqual([{ type: "notes", notes: [{ text: "plan" }] }]);
    expect(notesOf(victimAgain)).toEqual([{ type: "notes", notes: [{ text: "victim's" }] }]);
    expect(storage.data.get("notes:p0")).toEqual([{ text: "plan" }]);
  });

  it("Leave ship deletes the seat's notes", async () => {
    const { room, storage } = await newRoom(3, new FakeStorage(), CHEATS);
    const a = connect(room, "tok0");
    await send(room, a, { type: "note", tab: 0, text: "x" });
    expect(storage.data.has("notes:p0")).toBe(true);
    await send(room, a, { type: "leaveShip" });
    expect(storage.data.has("notes:p0")).toBe(false);
  });
});

describe("GameRoom storage reclamation (#339)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 19, 14) });
    return () => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    };
  });

  async function launchedShip(opts: { db?: ReturnType<typeof migratedDatabase> | null; bucket?: FakeR2Bucket | null } = {}) {
    const db = opts.db === undefined ? migratedDatabase() : opts.db;
    const bucket = opts.bucket === undefined ? new FakeR2Bucket() : opts.bucket;
    const storage = new FakeStorage();
    const room = new GameRoom(
      { storage } as never,
      { RULES_VERSION: "test", ALLOW_CHEATS: "true", ...(db && { DB: db }), ...(bucket && { REPLAYS: bucket }) } as never,
    );
    const store = db ? new AccountStore(db) : null;
    const tokens: string[] = [];
    for (const [name, character] of [["Ann", "chao"], ["Bob", "chun"], ["Cy", "frieda"]] as const) {
      let account: { accountId: string; sessionKey: string } | undefined;
      if (store) {
        const created = await store.createAccount(name, "dev", name, Date.now());
        if (!created.ok) throw new Error(created.reason);
        await store.boardShip(created.account.id, "test-room", Date.now());
        account = { accountId: created.account.id, sessionKey: `session-${name}` };
      }
      const joined = await room.join(name, character, STANDARD_SETUP, account, "en");
      if (!joined.ok) throw new Error(joined.error);
      tokens.push(joined.token);
    }
    return { room, storage, db, bucket, tokens };
  }

  async function endViaKube(room: GameRoom, conn: ReturnType<typeof connect>) {
    await send(room, conn, { type: "cheatRoom" });
    await send(room, conn, { type: "kube", op: "returnToSol" });
  }

  it("waits until both listed and replayReady are true, then waits 48 hours before deleting", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // Case 1: listed is false (no D1), replayReady is true -> no reclaimAt scheduled, nothing deleted even after 48h.
    const noDb = await launchedShip({ db: null });
    const c1 = connect(noDb.room, noDb.tokens[0]!);
    await endViaKube(noDb.room, c1);
    expect((noDb.storage.data.get("game") as { listed: boolean; replayReady: boolean; reclaimAt?: number })).toMatchObject({
      listed: false,
      replayReady: true,
    });
    expect((noDb.storage.data.get("game") as { reclaimAt?: number }).reclaimAt).toBeUndefined();
    vi.advanceTimersByTime(RECLAIM_DELAY_MS + 1000);
    const innerNoDb = noDb.room as unknown as { reclaimAt: number | null; reclaimStorage(): Promise<void> };
    innerNoDb.reclaimAt = Date.now() - 1;
    await innerNoDb.reclaimStorage();
    expect(innerNoDb.reclaimAt).toBeNull();
    expect(noDb.storage.data.size).toBeGreaterThan(0);

    // Case 2: listed is true, replayReady is false (no R2) -> no reclaimAt scheduled, nothing deleted even after 48h.
    const noBucket = await launchedShip({ bucket: null });
    const c2 = connect(noBucket.room, noBucket.tokens[0]!);
    await endViaKube(noBucket.room, c2);
    expect((noBucket.storage.data.get("game") as { listed: boolean; replayReady: boolean; reclaimAt?: number })).toMatchObject({
      listed: true,
      replayReady: false,
    });
    expect((noBucket.storage.data.get("game") as { reclaimAt?: number }).reclaimAt).toBeUndefined();
    vi.advanceTimersByTime(RECLAIM_DELAY_MS + 1000);
    await (noBucket.room as unknown as { reclaimStorage(): Promise<void> }).reclaimStorage();
    expect(noBucket.storage.data.size).toBeGreaterThan(0);

    // Once the missing replay copy succeeds on retry, reclaimAt is set 48 hours out from then.
    const bucket = new FakeR2Bucket();
    (noBucket.room as unknown as { env: Record<string, unknown> }).env.REPLAYS = bucket;
    vi.setSystemTime(noBucket.storage.alarm!);
    await noBucket.room.onAlarm();
    const expectedReclaim = Date.now() + RECLAIM_DELAY_MS;
    expect((noBucket.storage.data.get("game") as { listed: boolean; replayReady: boolean; reclaimAt?: number })).toMatchObject({
      listed: true,
      replayReady: true,
      reclaimAt: expectedReclaim,
    });
    expect(noBucket.storage.alarm).toBe(expectedReclaim);

    // Not deleted one ms before the 48-hour mark.
    vi.setSystemTime(expectedReclaim - 1);
    await noBucket.room.onAlarm();
    expect(noBucket.storage.data.size).toBeGreaterThan(0);
  });

  it("reclaims all room storage after 48 hours across restart, keeping D1 summary and R2 replay working", async () => {
    const { room, storage, db, bucket, tokens } = await launchedShip();
    const c0 = connect(room, tokens[0]!);
    await send(room, c0, { type: "chat", channel: CHAT_CHANNELS[0], text: "what the fuck" });
    await send(room, c0, { type: "chat", channel: CHAT_CHANNELS[0], text: "   " });
    await endViaKube(room, c0);

    const expectedReclaim = Date.now() + RECLAIM_DELAY_MS;
    expect(storage.alarm).toBe(expectedReclaim);
    expect(storage.data.size).toBeGreaterThan(2);

    // Evicted and revived before the 48-hour alarm fires.
    const revived = asRoom(storage, { RULES_VERSION: "test", ALLOW_CHEATS: "true" });
    (revived as unknown as { env: Record<string, unknown> }).env = { RULES_VERSION: "test", ALLOW_CHEATS: "true", DB: db!, REPLAYS: bucket! };
    await revived.onStart();
    expect(storage.alarm).toBe(expectedReclaim);
    const liveConn = connect(revived, tokens[1]!);
    expect(liveConn.closed).toBeNull();

    // At 48 hours, everything in room storage is deleted and open sockets are closed.
    vi.setSystemTime(expectedReclaim);
    await revived.onAlarm();
    expect([...storage.data.keys()]).toEqual(["reclaimed"]);
    expect(storage.alarm).toBeNull();
    expect(liveConn.closed?.code).toBe(4001);

    // New connections, joins, and resume see a retired/empty room; D1 and R2 still hold the game and replay.
    expect(connect(revived, tokens[0]!).closed?.code).toBe(4001);
    expect(await revived.join("Late", "janice")).toEqual({ ok: false, error: "ship_closed" });
    expect(await revived.resume("any", "s")).toEqual({ ok: false });
    expect(revived.seatAccounts()).toEqual([]);
    // Evicted again: the tombstone keeps it retired.
    const reloaded = asRoom(storage, { RULES_VERSION: "test", ALLOW_CHEATS: "true" });
    await reloaded.onStart();
    expect(await reloaded.join("Later", "janice")).toEqual({ ok: false, error: "ship_closed" });
    expect(storage.alarm).toBeNull();
    expect((await new GameStore(db!).listFinished()).games).toHaveLength(1);
    expect(bucket!.objects.has(replayKeys.index("test-room"))).toBe(true);
    expect(bucket!.objects.has(replayKeys.chunk("test-room", 0))).toBe(true);
    const mod = await bucket!.json<ReplayModeration>(replayKeys.moderation("test-room"));
    expect(Object.values(mod.raw)).toEqual(["what the fuck"]);
    expect(mod.blocked).toHaveLength(1);
  });

  it("refuses to delete and retries with backoff if R2 verification or deleteAll fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { room, storage, bucket, tokens } = await launchedShip();
    const c0 = connect(room, tokens[0]!);
    await endViaKube(room, c0);
    const reclaimAt = storage.alarm!;

    // Missing moderation.json (or chunk / index): keeps storage and reschedules with backoff.
    const savedMod = bucket!.objects.get(replayKeys.moderation("test-room"))!;
    bucket!.objects.delete(replayKeys.moderation("test-room"));
    vi.setSystemTime(reclaimAt);
    await room.onAlarm();
    expect(storage.data.size).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
    expect(storage.alarm).toBe(reclaimAt + 60_000);

    // Missing chunk: still refuses and doubles backoff.
    bucket!.objects.set(replayKeys.moderation("test-room"), savedMod);
    const savedChunk = bucket!.objects.get(replayKeys.chunk("test-room", 0))!;
    bucket!.objects.delete(replayKeys.chunk("test-room", 0));
    vi.setSystemTime(storage.alarm!);
    await room.onAlarm();
    expect(storage.data.size).toBeGreaterThan(0);
    expect(storage.alarm).toBe(reclaimAt + 60_000 + 120_000);

    // Restored in R2, but endShip fails once while aboard still has a seat: keeps storage and retries.
    bucket!.objects.set(replayKeys.chunk("test-room", 0), savedChunk);
    const endShipSpy = vi.spyOn(AccountStore.prototype, "endShip").mockRejectedValueOnce(new Error("D1 is down"));
    (room as unknown as { aboard: Record<string, string> }).aboard = { p0: "acc-1" };
    vi.setSystemTime(storage.alarm!);
    await room.onAlarm();
    expect(storage.data.size).toBeGreaterThan(0);
    expect(storage.alarm).toBe(reclaimAt + 60_000 + 120_000 + 240_000);
    endShipSpy.mockRestore();

    // Restored D1 + R2, but deleteAll fails once: keeps storage and retries.
    const deleteAllSpy = vi.spyOn(storage, "deleteAll").mockRejectedValueOnce(new Error("storage hiccup"));
    vi.setSystemTime(storage.alarm!);
    await room.onAlarm();
    expect(storage.data.size).toBeGreaterThan(0);
    expect(storage.alarm).not.toBeNull();
    deleteAllSpy.mockRestore();

    // Next retry succeeds.
    vi.setSystemTime(storage.alarm!);
    await room.onAlarm();
    expect([...storage.data.keys()]).toEqual(["reclaimed"]);
    expect(storage.alarm).toBeNull();
  });

  it("reclaims an unrecorded single-player game (no account) after 48 hours without R2 objects", async () => {
    const storage = new FakeStorage();
    const room = asRoom(storage, CHEATS);
    const token = await room.setupSinglePlayer("Solo", "chun", "en");
    const c = connect(room, token);
    await endViaKube(room, c);
    expect((storage.data.get("game") as { listed: boolean; replayReady: boolean; reclaimAt?: number })).toMatchObject({
      listed: true,
      replayReady: true,
      reclaimAt: Date.now() + RECLAIM_DELAY_MS,
    });
    vi.setSystemTime(storage.alarm!);
    await room.onAlarm();
    expect([...storage.data.keys()]).toEqual(["reclaimed"]);
    expect(storage.alarm).toBeNull();
  });
});
