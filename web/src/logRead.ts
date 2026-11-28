// Room log read state on the client (#513, docs/plans/archive/chat-pages.md "Room log read state (#513)").
//
// A line's position counts in `PlayerView.logSeen`: line i of `view.log` is `logSeen − log.length + i`. Two parts:
// - **The read point** (`upTo`): lines before it are read. The server keeps it per seat (shared/src/logRead.ts) and
//   says where it is on connect (`logUnread`); it moves when the oldest unread line is read, and goes back to the
//   server (`logRead`) at most every 5 s, and at once when the page is hidden, closed or the socket reconnects.
// - **The local set**: lines past the point read one at a time (hover, tap, focus) or seen live, kept per device in
//   localStorage. Lines that arrive while connected go straight into it.
// Only lines missed while the seat had no connection open are ever unread. Positions shift when the view's log does
// (walking into a room shows its history; Defacer erases lines), so while connected each view re-finds the unread
// lines by content; everything else counts as read, which keeps room history from ever looking new.

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { GameClientMessage, LogLine, PlayerId, PlayerView, RoomId } from "@mush2/shared";
import { defaultStorage, fnv1a, pruneOld, SEND_EVERY_MS, type StorageLike } from "./chatRead.ts";

const PREFIX = "mush2.logRead.";

/** The localStorage key for one seat's room log state in one game, next to chat's (`chatReadKey`). */
export const logReadKey = (roomId: string, token: string): string => `${PREFIX}${roomId}.${fnv1a(token)}`;

/** The view parts the room log state reads. */
export type LogViewPart = Pick<PlayerView, "log" | "logSeen"> & { you: Pick<PlayerView["you"], "id" | "room" | "alive"> };

export interface LogReadState {
  /** The body the positions count for; null before the first view. */
  body: PlayerId | null;
  /** Lines before this position are read; null until the server says (nothing is unread meanwhile). */
  upTo: number | null;
  /** Positions at or past `upTo` read one at a time or seen live. */
  local: ReadonlySet<number>;
}

const EMPTY: ReadonlySet<number> = new Set();
export const INITIAL_LOG_READ: LogReadState = { body: null, upTo: null, local: EMPTY };

// ---- Pure parts ----------------------------------------------------------------

/** The position of line `i` of `view.log`. */
export const positionOf = (view: Pick<PlayerView, "log" | "logSeen">, i: number): number => view.logSeen - view.log.length + i;

/** Whether the Room tab shows `line` while you stand in `room`: ship-wide lines and the room's own. */
export const shownIn = (line: Pick<LogLine, "room">, room: RoomId): boolean => line.room === undefined || line.room === room;

/** Whether the line at `pos` is unread. */
export const isUnread = (state: LogReadState, pos: number): boolean => state.upTo !== null && pos >= state.upTo && !state.local.has(pos);

/** The unread lines the Room tab shows, as positions, oldest first. The dead have no Room tab, so none. */
export function unreadPositions(view: LogViewPart, state: LogReadState): number[] {
  if (state.upTo === null || !view.you.alive || state.body !== view.you.id) return [];
  const out: number[] = [];
  view.log.forEach((line, i) => {
    const pos = positionOf(view, i);
    if (shownIn(line, view.you.room) && isUnread(state, pos)) out.push(pos);
  });
  return out;
}

/**
 * Moves the point past every line from it that is read or can't be hovered: one the Room tab doesn't show (another
 * room's) or one that has left the window. It stops at the first unread line shown, or at the end. Local entries it
 * passes are dropped.
 */
export function advance(view: LogViewPart, state: LogReadState): LogReadState {
  if (state.upTo === null) return state;
  const first = positionOf(view, 0);
  let upTo = state.upTo;
  while (upTo < view.logSeen) {
    const line = upTo >= first ? view.log[upTo - first] : undefined;
    if (line && shownIn(line, view.you.room) && !state.local.has(upTo)) break;
    upTo++;
  }
  if (upTo === state.upTo) return state;
  const local = new Set([...state.local].filter((p) => p >= upTo));
  return { ...state, upTo, local: local.size > 0 ? local : EMPTY };
}

/**
 * The state for `next`, a view that arrived while connected after `prev`. Its newest `logSeen − prev.logSeen` lines
 * arrived live, so they are read. When nothing was unread, everything is read. Otherwise each line unread in `prev` is
 * found again in `next` by its content (lines from a room you left aren't, so they stop counting), and every other
 * position is read.
 */
export function carryOver(prev: LogViewPart, next: LogViewPart, state: LogReadState): LogReadState {
  const added = Math.max(0, next.logSeen - prev.logSeen);
  if (state.upTo === null) {
    // The server hasn't said yet: live lines go into the set, to count when it does.
    if (added === 0) return state;
    const local = new Set(state.local);
    for (let p = next.logSeen - added; p < next.logSeen; p++) local.add(p);
    return { ...state, local };
  }
  const unread = unreadPositions(prev, state);
  if (unread.length === 0) return { ...state, upTo: Math.max(state.upTo, next.logSeen), local: EMPTY };
  // Each unread line's content, counted, so two identical lines are matched one each, newest first (unread lines are
  // the newest ones, so a repeated line keeps its icon on the later copy).
  const wanted = new Map<string, number>();
  const firstPrev = positionOf(prev, 0);
  for (const pos of unread) {
    const key = JSON.stringify(prev.log[pos - firstPrev]);
    wanted.set(key, (wanted.get(key) ?? 0) + 1);
  }
  const still = new Set<number>();
  const older = next.log.length - added;
  for (let i = older - 1; i >= 0; i--) {
    const line = next.log[i]!;
    if (!shownIn(line, next.you.room)) continue;
    const key = JSON.stringify(line);
    const n = wanted.get(key) ?? 0;
    if (n === 0) continue;
    wanted.set(key, n - 1);
    still.add(positionOf(next, i));
  }
  if (still.size === 0) return { ...state, upTo: Math.max(state.upTo, next.logSeen), local: EMPTY };
  const upTo = Math.min(state.upTo, ...still);
  const local = new Set<number>();
  for (let p = upTo; p < next.logSeen; p++) if (!still.has(p)) local.add(p);
  return { ...state, upTo, local };
}

// ---- Store ---------------------------------------------------------------------

/** One game's entry in localStorage. */
interface Stored {
  at: number;
  body: PlayerId;
  upTo: number;
  local: number[];
}

export interface LogReadStore {
  /** The current state; a new object whenever it changes. */
  state: () => LogReadState;
  /** Calls `fn` on every change. Returns the unsubscribe. */
  subscribe: (fn: () => void) => () => void;
  /** The socket (re)opened: the next view's new lines arrived while away, not live. Sends what is pending. */
  connected: () => void;
  /** Every view the socket brings. */
  onView: (view: LogViewPart) => void;
  /** The server's point (`logUnread`): the point takes the higher of the two, and a higher local one is sent back. */
  fromServer: (from: number) => void;
  /** The line at `pos` was hovered, tapped or focused. */
  markRead: (pos: number) => void;
  /** Mark all read. */
  markAll: () => void;
  /** Sends the point now (page hidden or closed). */
  flush: () => void;
  /** Sends what is pending; the store stays usable. */
  dispose: () => void;
}

function load(storage: StorageLike | undefined, key: string): LogReadState {
  try {
    if (!storage) return INITIAL_LOG_READ;
    pruneOld(storage, Date.now(), PREFIX);
    const raw = JSON.parse(storage.getItem(key) ?? "null") as Partial<Stored> | null;
    if (!raw || typeof raw.body !== "string" || !Number.isSafeInteger(raw.upTo) || (raw.upTo as number) < 0) return INITIAL_LOG_READ;
    const upTo = raw.upTo as number;
    const local = new Set((Array.isArray(raw.local) ? raw.local : []).filter((p): p is number => Number.isSafeInteger(p) && p >= upTo));
    return { body: raw.body, upTo, local };
  } catch {
    // No storage: the server's point alone.
    return INITIAL_LOG_READ;
  }
}

export function createLogReadStore({
  key,
  send,
  storage = defaultStorage(),
}: {
  /** `logReadKey(roomId, token)`. */
  key: string;
  send: (msg: GameClientMessage) => void;
  storage?: StorageLike | undefined;
}): LogReadStore {
  let state = load(storage, key);
  /** The last view, and whether it came on this connection (so the next one's new lines arrived live). */
  let last: LogViewPart | null = null;
  let live = false;
  /** The highest point the server is known to have: sent by it, or sent to it. */
  let serverUpTo = -1;
  const listeners = new Set<() => void>();
  let lastSent = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const save = () => {
    if (state.body === null || state.upTo === null) return;
    try {
      storage?.setItem(key, JSON.stringify({ at: Date.now(), body: state.body, upTo: state.upTo, local: [...state.local] } satisfies Stored));
    } catch {
      // Full or blocked: the server's point still has it once sent.
    }
  };
  const flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (state.upTo === null || state.upTo <= serverUpTo) return;
    serverUpTo = state.upTo;
    lastSent = Date.now();
    send({ type: "logRead", upTo: state.upTo });
  };
  const schedule = () => {
    if (timer !== undefined || state.upTo === null || state.upTo <= serverUpTo) return;
    timer = setTimeout(flush, Math.max(0, lastSent + SEND_EVERY_MS - Date.now()));
  };
  const set = (next: LogReadState) => {
    if (next === state) return;
    state = next;
    save();
    schedule();
    for (const fn of listeners) fn();
  };
  const advanced = (next: LogReadState) => (last ? advance(last, next) : next);

  return {
    state: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    connected: () => {
      live = false;
      serverUpTo = -1;
      flush();
    },
    onView: (view) => {
      const prev = last;
      last = view;
      if (state.body !== view.you.id) {
        // A new body (a Transfer, or the first view): its lines start over. Seen live, nothing in it is unread; on
        // connect, the server says.
        serverUpTo = -1;
        set({ body: view.you.id, upTo: live ? view.logSeen : null, local: EMPTY });
      } else if (live && prev) set(advanced(carryOver(prev, view, state)));
      else set(advanced(state));
      live = true;
    },
    fromServer: (from) => {
      serverUpTo = Math.max(serverUpTo, from);
      if (state.body === null) return;
      if (state.upTo === null || from > state.upTo) {
        const local = new Set([...state.local].filter((p) => p >= from));
        set(advanced({ ...state, upTo: from, local }));
      } else schedule();
    },
    markRead: (pos) => {
      if (!isUnread(state, pos)) return;
      set(advanced({ ...state, local: new Set(state.local).add(pos) }));
    },
    markAll: () => {
      if (!last || state.upTo === null) return;
      set({ ...state, upTo: Math.max(state.upTo, last.logSeen), local: EMPTY });
    },
    flush,
    // Only flushes: React's StrictMode runs effect cleanups and then the effects again on the same store.
    dispose: flush,
  };
}

// ---- React -------------------------------------------------------------------

const LogReadContext = createContext<LogReadStore | null>(null);

/** Provides the store to the iTrackie. GameScreen owns it (it owns the socket); with none, nothing is unread. */
export const LogReadProvider = LogReadContext.Provider;

/** The store, or null in a view with no socket (a replay, the design kit). */
export const useLogReadStore = (): LogReadStore | null => useContext(LogReadContext);

const noop = () => () => {};

/** The state, redrawing when it changes; `INITIAL_LOG_READ` (nothing unread) with no store. */
export function useLogRead(): LogReadState {
  const store = useLogReadStore();
  const subscribe = useCallback((fn: () => void) => (store ? store.subscribe(fn) : noop()), [store]);
  return useSyncExternalStore(subscribe, () => (store ? store.state() : INITIAL_LOG_READ));
}
