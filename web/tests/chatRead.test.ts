import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameClientMessage } from "@mush2/shared";
import { KEEP_MS, SEND_EVERY_MS, chatReadKey, createChatReadStore } from "../src/chatRead.ts";
import { readAllOn, totalUnread, unreadByTab } from "../src/hud/chatTabs.ts";

/** An in-memory localStorage. */
function memoryStorage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const throwing = {
  get length(): number {
    throw new Error("blocked");
  },
  key: () => {
    throw new Error("blocked");
  },
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

const KEY = chatReadKey("room1", "secret-token");

function setup(storage: ReturnType<typeof memoryStorage> | typeof throwing = memoryStorage()) {
  const sent: GameClientMessage[] = [];
  const store = createChatReadStore({ key: KEY, send: (m) => sent.push(m), storage });
  return { store, sent, storage };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000_000_000);
});
afterEach(() => vi.useRealTimers());

describe("chatReadKey", () => {
  it("holds the room and a hash of the token, never the token", () => {
    expect(KEY.startsWith("mush2.chatRead.room1.")).toBe(true);
    expect(KEY).not.toContain("secret-token");
    expect(chatReadKey("room1", "other")).not.toBe(KEY);
  });
});

describe("createChatReadStore", () => {
  it("only raises counts", () => {
    const { store } = setup();
    store.mark("global", 5);
    store.mark("global", 3);
    expect(store.read("global")).toBe(5);
    expect(store.read("mush")).toBe(0);
  });

  it("writes localStorage at once, and a new store reads it back", () => {
    const { store, storage } = setup();
    store.mark("global", 4);
    expect(JSON.parse((storage as ReturnType<typeof memoryStorage>).getItem(KEY) ?? "")).toEqual({ at: Date.now(), read: { global: 4 } });
    expect(setup(storage).store.read("global")).toBe(4);
  });

  it("notifies only the channel that changed, and '*' for any", () => {
    const { store } = setup();
    const global = vi.fn();
    const mush = vi.fn();
    const any = vi.fn();
    store.subscribe("global", global);
    store.subscribe("mush", mush);
    store.subscribe("*", any);
    store.mark("global", 1);
    store.mark("global", 1);
    expect([global.mock.calls.length, mush.mock.calls.length, any.mock.calls.length]).toEqual([1, 0, 1]);
  });

  it("keeps the snapshot's identity until a count changes", () => {
    const { store } = setup();
    store.mark("global", 2);
    const before = store.snapshot();
    store.mark("global", 1);
    expect(store.snapshot()).toBe(before);
    store.markAll({ global: 3, mush: 1 });
    expect(store.snapshot()).not.toBe(before);
    expect(store.snapshot()).toEqual({ global: 3, mush: 1 });
  });

  it("sends raised counts at most every few seconds", () => {
    const { store, sent } = setup();
    store.mark("global", 1);
    vi.advanceTimersByTime(0);
    expect(sent).toEqual([{ type: "chatRead", read: { global: 1 } }]);
    store.mark("global", 2);
    store.mark("mush", 1);
    vi.advanceTimersByTime(SEND_EVERY_MS - 1);
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sent[1]).toEqual({ type: "chatRead", read: { global: 2, mush: 1 } });
    vi.advanceTimersByTime(SEND_EVERY_MS * 3);
    expect(sent).toHaveLength(2);
  });

  it("flush sends what is pending at once, and nothing when nothing is", () => {
    const { store, sent } = setup();
    store.flush();
    expect(sent).toEqual([]);
    store.mark("global", 1);
    vi.advanceTimersByTime(0);
    store.mark("global", 2);
    store.flush();
    expect(sent).toEqual([
      { type: "chatRead", read: { global: 1 } },
      { type: "chatRead", read: { global: 2 } },
    ]);
  });

  it("takes the higher of each count from the server, and sends back the local ones that are higher", () => {
    const { store, sent } = setup();
    store.mark("global", 5);
    store.flush();
    sent.length = 0;
    store.mark("mush", 2);
    store.flush();
    sent.length = 0;
    const any = vi.fn();
    store.subscribe("*", any);
    store.fromServer({ global: 3, "th-1": 4 });
    expect(store.snapshot()).toEqual({ global: 5, mush: 2, "th-1": 4 });
    expect(any).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SEND_EVERY_MS);
    expect(sent).toEqual([{ type: "chatRead", read: { global: 5, mush: 2 } }]);
  });

  it("sends nothing back when the server has everything", () => {
    const { store, sent } = setup();
    store.fromServer({ global: 3 });
    vi.advanceTimersByTime(SEND_EVERY_MS);
    expect(sent).toEqual([]);
    expect(store.read("global")).toBe(3);
  });

  it("drops other games' entries untouched for two weeks", () => {
    const old = `mush2.chatRead.gone.abc`;
    const recent = `mush2.chatRead.kept.abc`;
    const storage = memoryStorage({
      [old]: JSON.stringify({ at: Date.now() - KEEP_MS - 1, read: { global: 1 } }),
      [recent]: JSON.stringify({ at: Date.now() - 1000, read: { global: 1 } }),
      "mush2.chatRead.broken": "{",
      "mush2.seat": "unrelated",
    });
    setup(storage);
    expect([...storage.map.keys()].sort()).toEqual([recent, "mush2.seat"].sort());
  });

  it("ignores bad stored counts", () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ at: Date.now(), read: { global: -1, mush: 2.5, "th-1": 3 } }) });
    expect(setup(storage).store.snapshot()).toEqual({ "th-1": 3 });
  });

  it("works with storage that throws", () => {
    const { store, sent } = setup(throwing);
    store.mark("global", 2);
    store.fromServer({ mush: 1 });
    store.flush();
    expect(store.snapshot()).toEqual({ global: 2, mush: 1 });
    expect(sent).toEqual([{ type: "chatRead", read: { global: 2 } }]);
  });
});

describe("unreadByTab", () => {
  it("sums each readable channel's unread by tab, never below zero", () => {
    const view = {
      readChannels: ["global", "th-1", "th-2", "botany", "pc-1", "mush"] as const,
      chatCounts: { global: 10, "th-1": 3, "th-2": 4, botany: 2, "pc-1": 1, mush: 5, graveyard: 9 },
    };
    expect(unreadByTab(view as never, { global: 7, "th-1": 3, "th-2": 1, mush: 9 })).toEqual({
      room: 0,
      global: 3,
      threads: 3,
      features: 2,
      private: 1,
      mush: 0,
      graveyard: 0,
    });
    expect(totalUnread(view as never, { global: 7, "th-1": 3, "th-2": 1, mush: 9 })).toBe(9);
  });
});

describe("readAllOn", () => {
  const view = {
    readChannels: ["global", "th-1", "th-2", "botany", "astrophysics", "pc-1"] as const,
    chatCounts: { global: 10, "th-1": 3, botany: 2, astrophysics: 4, "pc-1": 1, "pc-2": 6 },
  };
  it("raises every channel read on a grouped tab to its count", () => {
    expect(readAllOn(view as never, "threads")).toEqual({ "th-1": 3, "th-2": 0 });
    expect(readAllOn(view as never, "features")).toEqual({ botany: 2, astrophysics: 4 });
  });
  it("leaves channels the reader can't read, and has nothing for the Room tab", () => {
    expect(readAllOn(view as never, "private")).toEqual({ "pc-1": 1 });
    expect(readAllOn(view as never, "room")).toEqual({});
  });
});
