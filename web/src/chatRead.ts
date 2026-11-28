// Chat read state on the client (#400, docs/plans/archive/chat-pages.md "Read state (#400)"). Two ideas:
//
// - **Read**: one high-water count per channel (`ChatRead`, shared/src/chatRead.ts), kept in localStorage and on the
//   server. Drives the badges, the Mush tab and the page bar. Counts only rise; the store sends what rose to the server
//   at most every 5 s, and at once when the page is hidden, closed or the socket reconnects.
// - **Arrived**: what reached this client since it connected, in memory (`arrivedIn`, `isArrived`). Drives live
//   announcements, so a reload doesn't replay hours-old speech.

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { ChannelId, ChatLine, ChatRead, GameClientMessage, PlayerView } from "@mush2/shared";

// ---- Arrived -----------------------------------------------------------------

/** How many messages a client had in each channel it could read. A channel missing from it was not readable. */
export type Arrived = Partial<Record<ChannelId, number>>;

/** What `view` holds, as counts per readable channel (0 for an empty one). */
export function arrivedIn(view: Pick<PlayerView, "readChannels" | "chatCounts">): Arrived {
  return Object.fromEntries(view.readChannels.map((c) => [c, view.chatCounts[c] ?? 0]));
}

/**
 * Whether `m` arrived after `before`. A channel that wasn't readable then (an iTrackie picked up, an invite to a
 * private channel) brings its history, which didn't arrive.
 */
export function isArrived(before: Arrived, m: Pick<ChatLine, "channel" | "seq">): boolean {
  const count = before[m.channel];
  return count !== undefined && m.seq >= count;
}

/** A message's key in lists and caches: unique per game, and no game-wide id (ChatMessage.id says why). */
export const messageKey = (m: Pick<ChatLine, "channel" | "seq">): string => `${m.channel}:${m.seq}`;

// ---- Read --------------------------------------------------------------------

/** How often, at most, raised counts go to the server. */
export const SEND_EVERY_MS = 5_000;
/** A game's local counts are dropped this long after they last changed. */
export const KEEP_MS = 14 * 24 * 60 * 60 * 1000;
const PREFIX = "mush2.chatRead.";

/** FNV-1a, 32-bit, as hex: only so the seat token isn't copied into storage, not for security. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** The localStorage key for one seat's counts in one game. */
export const chatReadKey = (roomId: string, token: string): string => `${PREFIX}${roomId}.${fnv1a(token)}`;

/** One game's entry in localStorage. */
interface Stored {
  at: number;
  read: ChatRead;
}

export interface ChatReadStore {
  /** The count read in `channel` (0 when none). */
  read: (channel: ChannelId) => number;
  /** Every count, as one object that keeps its identity until a count changes. */
  snapshot: () => Readonly<ChatRead>;
  /** Calls `fn` when `channel`'s count changes, or any count for "*". Returns the unsubscribe. */
  subscribe: (channel: ChannelId | "*", fn: () => void) => () => void;
  /** Raises `channel` to `count` (never lowers it). */
  mark: (channel: ChannelId, count: number) => void;
  /** Raises each channel in `counts`. */
  markAll: (counts: Readonly<ChatRead>) => void;
  /** The server's counts: each channel takes the higher of the two, and a higher local count is sent back. */
  fromServer: (read: Readonly<ChatRead>) => void;
  /** Sends the raised counts now (page hidden or closed, socket reconnected). */
  flush: () => void;
  /** Sends what is pending; the store stays usable. */
  dispose: () => void;
}

/** Storage that may be missing or throw (private windows, blocked site data): every access is guarded. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** Drops every game's entry under `prefix` not touched for `KEEP_MS`. */
export function pruneOld(storage: StorageLike, now: number, prefix = PREFIX): void {
  const old: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (!k?.startsWith(prefix)) continue;
    try {
      const at = (JSON.parse(storage.getItem(k) ?? "null") as Partial<Stored> | null)?.at;
      if (typeof at !== "number" || now - at > KEEP_MS) old.push(k);
    } catch {
      old.push(k);
    }
  }
  for (const k of old) storage.removeItem(k);
}

/** A stored count map, keeping only non-negative integer counts. */
function cleanRead(raw: unknown): ChatRead {
  const read: ChatRead = {};
  if (!raw || typeof raw !== "object") return read;
  for (const [c, n] of Object.entries(raw)) if (Number.isSafeInteger(n) && (n as number) > 0) read[c as ChannelId] = n as number;
  return read;
}

export function createChatReadStore({
  key,
  send,
  storage = defaultStorage(),
}: {
  /** `chatReadKey(roomId, token)`. */
  key: string;
  send: (msg: GameClientMessage) => void;
  storage?: StorageLike | undefined;
}): ChatReadStore {
  let read: ChatRead = {};
  try {
    if (storage) {
      pruneOld(storage, Date.now());
      read = cleanRead((JSON.parse(storage.getItem(key) ?? "null") as Partial<Stored> | null)?.read);
    }
  } catch {
    // No storage: counts start from the server's.
  }
  const dirty = new Set<ChannelId>();
  const listeners = new Map<ChannelId | "*", Set<() => void>>();
  let lastSent = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const save = () => {
    try {
      storage?.setItem(key, JSON.stringify({ at: Date.now(), read } satisfies Stored));
    } catch {
      // Full or blocked: the server's copy still has them once sent.
    }
  };
  const notify = (changed: readonly ChannelId[]) => {
    if (changed.length === 0) return;
    for (const c of changed) for (const fn of listeners.get(c) ?? []) fn();
    for (const fn of listeners.get("*") ?? []) fn();
  };
  const flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (dirty.size === 0) return;
    const out: ChatRead = {};
    for (const c of dirty) out[c] = read[c] ?? 0;
    dirty.clear();
    lastSent = Date.now();
    send({ type: "chatRead", read: out });
  };
  const schedule = () => {
    if (timer !== undefined || dirty.size === 0) return;
    timer = setTimeout(flush, Math.max(0, lastSent + SEND_EVERY_MS - Date.now()));
  };
  /** Raises the counts in `counts`; `toServer` marks them to send. Returns the channels that rose. */
  const raise = (counts: Readonly<ChatRead>, toServer: boolean): ChannelId[] => {
    const rose: ChannelId[] = [];
    let next = read;
    for (const [c, n] of Object.entries(counts) as [ChannelId, number][]) {
      if (!(n > (next[c] ?? 0))) continue;
      if (next === read) next = { ...read };
      next[c] = n;
      rose.push(c);
      if (toServer) dirty.add(c);
    }
    if (rose.length === 0) return rose;
    read = next;
    save();
    if (toServer) schedule();
    return rose;
  };

  return {
    read: (c) => read[c] ?? 0,
    snapshot: () => read,
    subscribe: (c, fn) => {
      let set = listeners.get(c);
      if (!set) listeners.set(c, (set = new Set()));
      set.add(fn);
      return () => set.delete(fn);
    },
    mark: (c, count) => notify(raise({ [c]: count }, true)),
    markAll: (counts) => notify(raise(counts, true)),
    fromServer: (server) => {
      const rose = raise(server, false);
      // Counts read here that the server doesn't have yet (read before a reload, or while the socket was down).
      for (const [c, n] of Object.entries(read) as [ChannelId, number][]) if (n > (server[c] ?? 0)) dirty.add(c);
      schedule();
      notify(rose);
    },
    flush,
    // Only flushes: React's StrictMode runs effect cleanups and then the effects again on the same store.
    dispose: flush,
  };
}

// ---- React -------------------------------------------------------------------

const ChatReadContext = createContext<ChatReadStore | null>(null);

/** Provides the store to the chat UI. GameScreen owns it (it owns the socket); with none, everything reads as read. */
export const ChatReadProvider = ChatReadContext.Provider;

/** The store, or null in a view with no socket (a replay, the design kit). */
export const useChatReadStore = (): ChatReadStore | null => useContext(ChatReadContext);

const noop = () => () => {};
const NONE: Readonly<ChatRead> = {};

/**
 * The count read in `channel`, redrawing only when that channel's count changes. With no store, `fallback`: pass the
 * channel's message count so everything reads as read.
 */
export function useReadCount(channel: ChannelId, fallback: number): number {
  const store = useChatReadStore();
  const subscribe = useCallback((fn: () => void) => (store ? store.subscribe(channel, fn) : noop()), [store, channel]);
  return useSyncExternalStore(subscribe, () => (store ? store.read(channel) : fallback));
}

/** Every count, redrawing when any changes; null with no store (everything reads as read). */
export function useReadSnapshot(): Readonly<ChatRead> | null {
  const store = useChatReadStore();
  const subscribe = useCallback((fn: () => void) => (store ? store.subscribe("*", fn) : noop()), [store]);
  const snap = useSyncExternalStore(subscribe, () => (store ? store.snapshot() : NONE));
  return store ? snap : null;
}
