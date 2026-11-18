import { parseItemLine } from "../src/bots/itemShare.ts";
import { HOLD_JUMP_LINE } from "../src/bots/planetShare.ts";
import { BOT_MEMORY_VERSION } from "../src/bots/memoryStore.ts";
import {
  characterName,
  legalIn,
} from "@mush2/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOT_CHAT_CHAIN_DEPTH } from "../src/bots.ts";
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
  nextCycleAt,
  wakeAll,
  send,
  lastMsg,
  lastViewMsg,
  lastView,
  gameOf,
} from "./gameRoomHarness.ts";

// Mocked before the harness imports GameRoom, so the room extends the fake server.
vi.mock("partyserver", () => ({ Server: FakeServer }));

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
      // Actions only: a bot's item-sharing chat line (bots/itemShare.ts) goes out on its first turn
      // without a model call, so it isn't a sign the bot ignored the pause.
      const byModelBots = () =>
        [...storage.data].filter(([k, v]) => {
          const { input } = v as { input: { by: string; type: string } };
          return k.startsWith("input:") && input.type === "action" && ["p1", "p2", "p3"].includes(input.by);
        }).length;
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
      // What the bots said, leaving out their item lines (itemShare.ts), which code posts whatever the model says.
      const botMessages = (room: Room) => gameOf(room).chat.filter((m) => m.from !== null && ["p1", "p2", "p3"].includes(m.from) && parseItemLine(m.text) === null);

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

      it("wake nobody for a bots' jump line, which code parses (#427)", async () => {
        const fetch = chatty("heard you");
        vi.stubGlobal("fetch", fetch);
        const { room, storage } = await modelRoom({ ...DEV, ...MODEL });
        const human = connect(room, "tok0");
        await pass(room, storage, 1500);
        const before = fetch.mock.calls.length;
        await send(room, human, { type: "chat", channel: "global", text: HOLD_JUMP_LINE });
        await pass(room, storage, 5000);
        const prompts = promptsOf(fetch, before);
        expect(prompts.some((m) => m[0]!.content.startsWith("You route chat"))).toBe(false);
        expect(prompts.some((m) => m[1]!.content.includes("A new chat message came in"))).toBe(false);
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
    for (let i = 0; i < 3; i++) await playOut(room, storage);
    expect(lastView(c).cycleOfDay).toBe(5);
    expect(lastView(c).players.every((p) => !p.ready)).toBe(true);
    await send(room, c, { type: "action", action: { type: "ready" } });
    for (let i = 0; i < 20 && lastView(c).cycleOfDay === 5; i++) await playOut(room, storage);
    expect(lastView(c).cycleOfDay).toBe(6);
    vi.unstubAllGlobals();
  }, 20_000);

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

  it("keeps each bot's memory in room storage across a restart, and never in a view or the record (#440)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { room, storage, token } = await soloRoom();
    connect(room, token);
    await playOut(room, storage);
    const botKeys = [...storage.data.keys()].filter((k) => k.startsWith("bot:")).sort();
    expect(botKeys).toEqual(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"].map((s) => `bot:${s}`));
    // A fact only the stored memory holds: a marker no game input could put anywhere else.
    const marker = "remembered-440";
    const p1 = storage.data.get("bot:p1") as { shrinks: string[]; version: number };
    p1.shrinks.push(marker);
    (storage.data.get("bot:p2") as { version: number }).version = -1; // another version's snapshot
    const revived = asRoom(storage);
    await revived.onStart();
    const bots = (revived as unknown as { bots: Map<string, { snapshot(): { shrinks: string[]; version: number } }> }).bots;
    expect(bots.get("p1")!.snapshot().shrinks).toContain(marker);
    expect(bots.get("p2")!.snapshot().shrinks).not.toContain(marker);
    const c = connect(revived, token);
    await playOut(revived, storage);
    expect((storage.data.get("bot:p2") as { version: number }).version).toBe(BOT_MEMORY_VERSION);
    expect((storage.data.get("bot:p1") as { shrinks: string[] }).shrinks).toContain(marker);
    expect(JSON.stringify(c.messages())).not.toContain(marker);
    for (const [key, value] of storage.data) if (!key.startsWith("bot:")) expect(JSON.stringify(value), key).not.toContain(marker);
    vi.unstubAllGlobals();
  }, 20_000);

  it("stays single player after a restart", async () => {
    const { storage, token } = await soloRoom();
    const revived = asRoom(storage);
    await revived.onStart();
    expect(lastViewMsg(connect(revived, token))).toMatchObject({ type: "view", nextCycleAt: null });
  });
});
