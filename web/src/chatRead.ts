// Chat read state on the client (#400, #513; docs/plans/archive/chat-pages.md "Read state (#400)"). Two ideas:
//
// - **Read**: one high-water count per channel (`ChatRead`, shared/src/chatRead.ts), kept in localStorage and on the
//   server, plus the messages past it read one at a time (`LocalReads`, #513), kept on this device only. A message is
//   read by hover, tap or focus on it alone; when the oldest unread one is read, the count moves past the whole run of
//   read (and unheard) messages after it and the entries it passes are dropped. Drives the badges, the unread icons,
//   the Mush tab and the page bar. Counts only rise; the store sends what rose to the server at most every 5 s, and at
//   once when the page is hidden, closed or the socket reconnects.
// - **Arrived**: what reached this client since it connected, in memory (`arrivedIn`, `isArrived`). Drives live
//   announcements, so a reload doesn't replay hours-old speech.

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { inRanges, type ChannelId, type ChatLine, type ChatRead, type GameClientMessage, type LocalReads, type PlayerView, type SeqRange } from "@mush2/shared";

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
  /** Missing in entries saved before #513. */
  local?: LocalReads;
}

/** Everything read: the counts and the messages read one at a time past them. */
export interface ReadSnapshot {
  read: Readonly<ChatRead>;
  local: Readonly<LocalReads>;
}

const NO_SEQS: readonly number[] = [];

/** Whether `seq` in `channel` is read in `snap`. */
export const isReadIn = (snap: ReadSnapshot, channel: ChannelId, seq: number): boolean =>
  seq < (snap.read[channel] ?? 0) || (snap.local[channel] ?? NO_SEQS).includes(seq);

export interface ChatReadStore {
  /** The count read in `channel` (0 when none). */
  read: (channel: ChannelId) => number;
  /** `channel`'s messages read one at a time past its count, ascending; keeps its identity until it changes. */
  local: (channel: ChannelId) => readonly number[];
  /** Everything read, as one object that keeps its identity until something changes. */
  snapshot: () => ReadSnapshot;
  /** Calls `fn` when `channel`'s read state changes, or any channel's for "*". Returns the unsubscribe. */
  subscribe: (channel: ChannelId | "*", fn: () => void) => () => void;
  /**
   * Marks these messages of `channel` read, each on its own (#513): never anything before them. When the oldest unread
   * one is among them, the count moves past the run of read messages, and of `unheard` ones (never shown, so never
   * hovered), up to `total`, the channel's message count.
   */
  markSeqs: (channel: ChannelId, seqs: readonly number[], total: number, unheard?: readonly SeqRange[]) => void;
  /** Mark all read: raises each channel in `counts`. */
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

/** A stored local map: per channel, ascending integers at or past its count. */
function cleanLocal(raw: unknown, read: ChatRead): LocalReads {
  const local: LocalReads = {};
  if (!raw || typeof raw !== "object") return local;
  for (const [c, seqs] of Object.entries(raw)) {
    if (!Array.isArray(seqs)) continue;
    const from = read[c as ChannelId] ?? 0;
    const kept = [...new Set(seqs.filter((n): n is number => Number.isSafeInteger(n) && n >= from))].sort((x, y) => x - y);
    if (kept.length > 0) local[c as ChannelId] = kept;
  }
  return local;
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
  let local: LocalReads = {};
  try {
    if (storage) {
      pruneOld(storage, Date.now());
      const raw = JSON.parse(storage.getItem(key) ?? "null") as Partial<Stored> | null;
      read = cleanRead(raw?.read);
      local = cleanLocal(raw?.local, read);
    }
  } catch {
    // No storage: counts start from the server's.
  }
  const dirty = new Set<ChannelId>();
  const listeners = new Map<ChannelId | "*", Set<() => void>>();
  let lastSent = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;

  let snap: ReadSnapshot = { read, local };
  const save = () => {
    snap = { read, local };
    try {
      storage?.setItem(key, JSON.stringify({ at: Date.now(), read, local } satisfies Stored));
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
    for (const [c, given] of Object.entries(counts) as [ChannelId, number][]) {
      // A count that reaches messages read one at a time runs on past them.
      let n = given;
      if (local[c]) while (local[c]!.includes(n)) n++;
      if (!(n > (next[c] ?? 0))) continue;
      if (next === read) next = { ...read };
      next[c] = n;
      rose.push(c);
      if (toServer) dirty.add(c);
      // Entries the count passed are dropped.
      const seqs = local[c];
      if (seqs) {
        const kept = seqs.filter((q) => q >= n);
        if (kept.length !== seqs.length) {
          local = { ...local };
          if (kept.length > 0) local[c] = kept;
          else delete local[c];
        }
      }
    }
    if (rose.length === 0) return rose;
    read = next;
    save();
    if (toServer) schedule();
    return rose;
  };

  return {
    read: (c) => read[c] ?? 0,
    local: (c) => local[c] ?? NO_SEQS,
    snapshot: () => snap,
    subscribe: (c, fn) => {
      let set = listeners.get(c);
      if (!set) listeners.set(c, (set = new Set()));
      set.add(fn);
      return () => set.delete(fn);
    },
    markSeqs: (c, seqs, total, unheard) => {
      const from = read[c] ?? 0;
      const had = local[c] ?? NO_SEQS;
      const set = new Set(had);
      for (const q of seqs) if (Number.isSafeInteger(q) && q >= from && q < total && !inRanges(unheard, q)) set.add(q);
      if (set.size === had.length) return;
      let to = from;
      while (to < total && (set.has(to) || inRanges(unheard, to))) to++;
      const kept = [...set].filter((q) => q >= to).sort((x, y) => x - y);
      local = { ...local };
      if (kept.length > 0) local[c] = kept;
      else delete local[c];
      // `raise` saves when the count moved; otherwise only the set changed.
      if (raise({ [c]: to }, true).length === 0) save();
      notify([c]);
    },
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
const NONE: ReadSnapshot = { read: {}, local: {} };

/**
 * The count read in `channel`, redrawing only when that channel's count changes. With no store, `fallback`: pass the
 * channel's message count so everything reads as read.
 */
export function useReadCount(channel: ChannelId, fallback: number): number {
  const store = useChatReadStore();
  const subscribe = useCallback((fn: () => void) => (store ? store.subscribe(channel, fn) : noop()), [store, channel]);
  return useSyncExternalStore(subscribe, () => (store ? store.read(channel) : fallback));
}

/** `channel`'s messages read one at a time past its count, redrawing only when they change. Empty with no store. */
export function useLocalReads(channel: ChannelId): readonly number[] {
  const store = useChatReadStore();
  const subscribe = useCallback((fn: () => void) => (store ? store.subscribe(channel, fn) : noop()), [store, channel]);
  return useSyncExternalStore(subscribe, () => (store ? store.local(channel) : NO_SEQS));
}

/** Everything read, redrawing when anything changes; null with no store (everything reads as read). */
export function useReadSnapshot(): ReadSnapshot | null {
  const store = useChatReadStore();
  const subscribe = useCallback((fn: () => void) => (store ? store.subscribe("*", fn) : noop()), [store]);
  const snap = useSyncExternalStore(subscribe, () => (store ? store.snapshot() : NONE));
  return store ? snap : null;
}
