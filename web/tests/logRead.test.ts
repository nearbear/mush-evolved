// The room log's read state on the client (#513): the pure parts of logRead.ts and its store.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameClientMessage, LogLine, PlayerId, RoomId } from "@mush2/shared";
import { SEND_EVERY_MS } from "../src/chatRead.ts";
import {
  INITIAL_LOG_READ,
  advance,
  carryOver,
  createLogReadStore,
  logReadKey,
  positionOf,
  unreadPositions,
  type LogReadState,
  type LogViewPart,
} from "../src/logRead.ts";

/** A line; `room` undefined is ship-wide. */
const line = (key: string, room: RoomId | undefined = "bridge" as RoomId): LogLine => ({ cycle: 1, key, visibleTo: "all", ...(room ? { room } : {}) });

/** A view whose last line is position `logSeen − 1`. */
function view(lines: LogLine[], logSeen = lines.length, { room = "bridge", id = "p0", alive = true }: { room?: string; id?: string; alive?: boolean } = {}): LogViewPart {
  return { log: lines, logSeen, you: { id: id as PlayerId, room: room as RoomId, alive } };
}

const state = (upTo: number | null, local: number[] = [], body = "p0"): LogReadState => ({ body: body as PlayerId, upTo, local: new Set(local) });

describe("room log read state, pure parts (#513)", () => {
  it("counts positions in logSeen", () => {
    const v = view([line("a"), line("b")], 10);
    expect(positionOf(v, 0)).toBe(8);
    expect(positionOf(v, 1)).toBe(9);
  });

  it("counts only lines the Room tab shows, past the point and not read one at a time", () => {
    const v = view([line("a"), line("b", "lab" as RoomId), line("c", undefined), line("d"), line("e")], 5);
    expect(unreadPositions(v, state(1, [3]))).toEqual([2, 4]);
    expect(unreadPositions(v, state(null))).toEqual([]);
    // The dead have no Room tab; another body's positions mean nothing here.
    expect(unreadPositions(view(v.log, 5, { alive: false }), state(0))).toEqual([]);
    expect(unreadPositions(v, state(0, [], "p1"))).toEqual([]);
  });

  it("moves the point over read lines, other rooms' lines and lines out of the window, then drops what it passed", () => {
    // Positions 3..7: lab, read, unread, read, unread.
    const v = view([line("a", "lab" as RoomId), line("b"), line("c"), line("d"), line("e")], 8);
    expect(advance(v, state(1, [4, 6]))).toEqual(state(5, [6]));
    // Nothing to do: the same object back.
    const s = state(5, [6]);
    expect(advance(v, s)).toBe(s);
    // All read: to the end, with an empty set.
    expect(advance(v, state(5, [5, 6, 7]))).toEqual(state(8));
  });

  it("reads lines that arrive live, and everything when nothing was unread", () => {
    const prev = view([line("a"), line("b")], 2);
    const next = view([line("a"), line("b"), line("c")], 3);
    expect(carryOver(prev, next, state(2))).toEqual(state(3));
    // With one unread, the new line goes in the set.
    expect(carryOver(prev, next, state(1))).toEqual(state(1, [2]));
  });

  it("re-finds unread lines by content when the window shifts", () => {
    // Positions 0..3, with 2 and 3 unread; the window then drops its first line and one arrives.
    const prev = view([line("a"), line("b"), line("c"), line("d")], 4);
    const next = view([line("b"), line("c"), line("d"), line("e")], 5);
    expect(carryOver(prev, next, state(2))).toEqual(state(2, [4]));
    // Defacer erases "c": positions shift down, so "d" is found at 2 and the rest is read.
    const defaced = view([line("a"), line("b"), line("d")], 3);
    expect(carryOver(prev, defaced, state(2))).toEqual(state(2));
    expect(unreadPositions(defaced, state(2))).toEqual([2]);
  });

  it("stops counting a room's unread lines once you leave it, and never treats room history as new", () => {
    const prev = view([line("a"), line("b")], 2);
    // Walking into the lab: its history replaces the bridge's in the window.
    const next = view([line("x", "lab" as RoomId), line("y", "lab" as RoomId), line("z", "lab" as RoomId)], 5, { room: "lab" });
    expect(carryOver(prev, next, state(0))).toEqual(state(5));
  });

  it("keeps identical lines apart when re-finding them", () => {
    const prev = view([line("a"), line("a"), line("a")], 3);
    const next = view([line("a"), line("a"), line("a")], 3);
    // Only the last one was unread: only it is found again, not an older copy.
    expect(unreadPositions(next, carryOver(prev, next, state(2)))).toEqual([2]);
  });
});

/** An in-memory localStorage. */
function memoryStorage() {
  const map = new Map<string, string>();
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

const KEY = logReadKey("room1", "secret-token");

function setup(storage: ReturnType<typeof memoryStorage> | undefined = memoryStorage()) {
  const sent: GameClientMessage[] = [];
  const store = createLogReadStore({ key: KEY, send: (m) => sent.push(m), storage });
  return { store, sent, storage };
}

const lines = (n: number) => Array.from({ length: n }, (_, i) => line(`l${i}`));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000_000_000);
});
afterEach(() => vi.useRealTimers());

describe("room log read store (#513)", () => {
  it("keeps the token out of the storage key", () => {
    expect(KEY).not.toContain("secret-token");
  });

  it("shows nothing unread until the server says where the point is, then the missed lines", () => {
    const { store } = setup();
    store.connected();
    const v = view(lines(5));
    store.onView(v);
    expect(store.state()).toEqual({ ...INITIAL_LOG_READ, body: "p0" });
    store.fromServer(3);
    expect(unreadPositions(v, store.state())).toEqual([3, 4]);
  });

  it("reads one line at a time, and moves the point only when the oldest unread one is read", () => {
    const { store, sent } = setup();
    store.connected();
    const v = view(lines(5));
    store.onView(v);
    store.fromServer(2);
    store.markRead(3);
    expect(unreadPositions(v, store.state())).toEqual([2, 4]);
    vi.runAllTimers();
    expect(sent).toEqual([]);
    store.markRead(2);
    expect(store.state().upTo).toBe(4);
    vi.runAllTimers();
    expect(sent).toEqual([{ type: "logRead", upTo: 4 }]);
  });

  it("sends at most every few seconds, and at once on flush", () => {
    const { store, sent } = setup();
    store.connected();
    const v = view(lines(5));
    store.onView(v);
    store.fromServer(0);
    store.markRead(0);
    vi.advanceTimersByTime(0);
    expect(sent).toEqual([{ type: "logRead", upTo: 1 }]);
    store.markRead(1);
    vi.advanceTimersByTime(SEND_EVERY_MS - 1);
    expect(sent).toHaveLength(1);
    store.flush();
    expect(sent).toEqual([
      { type: "logRead", upTo: 1 },
      { type: "logRead", upTo: 2 },
    ]);
  });

  it("marks all read", () => {
    const { store } = setup();
    store.connected();
    const v = view(lines(5));
    store.onView(v);
    store.fromServer(1);
    store.markAll();
    expect(store.state().upTo).toBe(5);
    expect(unreadPositions(v, store.state())).toEqual([]);
  });

  it("reads lines that arrive while connected, but not those in the first view after a reconnect", () => {
    const { store } = setup();
    store.connected();
    store.onView(view(lines(3)));
    store.fromServer(3);
    store.onView(view(lines(4)));
    expect(store.state().upTo).toBe(4);
    // Away: two lines arrive; the next view carries them, and the server's point says they were missed.
    store.connected();
    const back = view(lines(6));
    store.onView(back);
    store.fromServer(4);
    expect(unreadPositions(back, store.state())).toEqual([4, 5]);
  });

  it("starts over for a new body (a Transfer): nothing in it is unread", () => {
    const { store } = setup();
    store.connected();
    store.onView(view(lines(5)));
    store.fromServer(2);
    const other = view(lines(1), 1, { id: "p1" });
    store.onView(other);
    expect(store.state()).toEqual(state(1, [], "p1"));
  });

  it("keeps single reads across a reload, and drops them when the server's point passes them", () => {
    const storage = memoryStorage();
    const first = setup(storage).store;
    first.connected();
    first.onView(view(lines(5)));
    first.fromServer(2);
    first.markRead(4);
    const { store } = setup(storage);
    store.connected();
    const v = view(lines(5));
    store.onView(v);
    expect(unreadPositions(v, store.state())).toEqual([2, 3]);
    store.fromServer(3);
    expect(store.state()).toEqual(state(3, [4]));
  });

  it("works without storage, on the server's point alone", () => {
    const blocked = {
      get length(): number {
        throw new Error("blocked");
      },
      key: () => null,
      getItem: (): string | null => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    const sent: GameClientMessage[] = [];
    const store = createLogReadStore({ key: KEY, send: (m) => sent.push(m), storage: blocked });
    store.connected();
    const v = view(lines(3));
    store.onView(v);
    store.fromServer(1);
    store.markRead(1);
    expect(store.state().upTo).toBe(2);
  });
});
