// Screen-reader announcements. Two visually hidden live regions (polite and assertive, drawn by
// `hud/Announcer.tsx`) are fed from here. Text is batched for a moment so a burst of events reads as
// one announcement, and a long burst is cut to the first few lines plus a count. The verbosity is a
// per-viewer preference kept in localStorage, like `fogDepth.ts`.

import { useSyncExternalStore } from "react";
import { DEFAULT_CONFIG, unreadCount, type ChannelId, type ChatLine, type ChatRead, type LogLine, type PlayerView } from "@mush2/shared";
import { arrivedIn, isArrived, type Arrived } from "./chatRead.ts";

export type Urgency = "polite" | "assertive";
/** all: everything; mentions: urgent events, private entries and messages that name you or come on private channels; off: none (your own send confirmations and errors still speak). */
export type Verbosity = "all" | "mentions" | "off";

export interface Line {
  id: number;
  text: string;
}

const BATCH_MS: Record<Urgency, number> = { polite: 700, assertive: 100 };
/** Lines per announcement; the rest are summarised as a count. */
const MAX_LINES = 4;
/** Lines kept in a live region's DOM. */
const KEEP = 3;

let nextId = 1;
let lines: Record<Urgency, Line[]> = { polite: [], assertive: [] };
let last = "";
/** "and N more", in the current language; the Announcer component keeps it current. */
let moreText: (count: number) => string = (count) => `+${count}`;
export function setMoreText(fn: (count: number) => string): void {
  moreText = fn;
}
const pending: Record<Urgency, string[]> = { polite: [], assertive: [] };
const timers: Partial<Record<Urgency, ReturnType<typeof setTimeout>>> = {};
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/** Queues `text` for the live region of that urgency; it is spoken with whatever else arrives within the batch window. */
export function announce(text: string, urgency: Urgency = "polite"): void {
  if (!text) return;
  pending[urgency].push(text);
  timers[urgency] ??= setTimeout(() => flush(urgency), BATCH_MS[urgency]);
}

function flush(urgency: Urgency): void {
  timers[urgency] = undefined;
  const batch = pending[urgency].splice(0);
  if (!batch.length) return;
  const text = batchText(batch, moreText);
  last = text;
  lines = { ...lines, [urgency]: [...lines[urgency], { id: nextId++, text }].slice(-KEEP) };
  emit();
}

/** The batch as one string: the first lines, then "and N more" for the rest. */
export function batchText(batch: string[], more: (count: number) => string): string {
  if (batch.length <= MAX_LINES) return batch.join(" ");
  return [...batch.slice(0, MAX_LINES), more(batch.length - MAX_LINES)].join(" ");
}

/** Speaks the last announcement again. */
export function repeatLast(): void {
  if (last) announce(last);
}

export function useAnnouncerLines(urgency: Urgency): Line[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => lines[urgency],
  );
}

// --- verbosity ---

const KEY = "mush2.announce";
const verbosityListeners = new Set<() => void>();
let verbosity: Verbosity = loadVerbosity();

export function parseVerbosity(v: string | null): Verbosity {
  return v === "mentions" || v === "off" ? v : "all";
}

function loadVerbosity(): Verbosity {
  try {
    return parseVerbosity(localStorage.getItem(KEY));
  } catch {
    return "all"; // storage blocked: the default
  }
}

export function setVerbosity(v: Verbosity): void {
  verbosity = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // storage blocked: the choice lasts until the page reloads
  }
  for (const l of verbosityListeners) l();
}

export function getVerbosity(): Verbosity {
  return verbosity;
}

export function useVerbosity(): Verbosity {
  return useSyncExternalStore(
    (cb) => {
      verbosityListeners.add(cb);
      return () => verbosityListeners.delete(cb);
    },
    () => verbosity,
  );
}

// --- what is new in a view ---

/** How far the announcer has read: whose view, its `logSeen`, the newest chat id and the latest cycle heard. */
export interface Seen {
  /** The body the view was for (`you.id`); a Transfer changes it, and the other body's count means nothing here. */
  body: string;
  log: number;
  chat: Arrived;
  cycle: number;
}

/** Log keys that interrupt: the ship or someone in the room is hurting. Entries with `level` `"warning"` or `"danger"` interrupt too. */
export const URGENT_LOG_KEYS: ReadonlySet<string> = new Set([
  "oxygenOut",
  "randomInjury",
  "attacked",
  "attackedArea",
  ...Object.values(DEFAULT_CONFIG.weapons.types).flatMap((w) => w.hitOutcomes.map((o) => o.log)),
  "died",
  "diedHuman",
  "diedMush",
  "mycoAlarmRang",
  "hunterWave_one",
  "hunterWave_other",
  "hunterWave",
  "shipDestroyed",
  "patrolRough",
  "hunterHitPatrol",
]);

export function isUrgent(e: Pick<LogLine, "key" | "level">): boolean {
  return e.level === "warning" || e.level === "danger" || URGENT_LOG_KEYS.has(e.key);
}

export interface Fresh {
  /** New log entries from the room you are in, or private to you. */
  log: LogLine[];
  /** New chat messages (including your own and the game's). */
  chat: ChatLine[];
  /** The newest cycle among `log`, if it is later than the last one heard. */
  cycle: number | undefined;
  seen: Seen;
}

/** What `view` holds that `seen` has not covered. `seen` null means the first view: nothing is announced for history. */
export function freshIn(seen: Seen | null, view: PlayerView): Fresh {
  const latestCycle = view.log.reduce((n, e) => Math.max(n, e.cycle), 0);
  const next: Seen = { body: view.you.id, log: view.logSeen, chat: arrivedIn(view), cycle: Math.max(seen?.cycle ?? 0, latestCycle) };
  if (!seen || seen.body !== view.you.id) return { log: [], chat: [], cycle: undefined, seen: next };
  const here = view.you.room;
  // The log's length says nothing once the window drops old lines (#365): `logSeen` counts every line this seat has
  // seen, so the newest `added` lines of the log are the new ones.
  const added = view.logSeen - seen.log;
  const log = added > 0 ? view.log.slice(-added).filter((e) => e.room === undefined || e.room === here) : [];
  return {
    log,
    chat: view.chat.filter((m) => isArrived(seen.chat, m)),
    cycle: latestCycle > seen.cycle ? latestCycle : undefined,
    seen: next,
  };
}

/**
 * The "N unread in …" counts to speak, for channels where messages arrived but weren't read out (#400). With a read
 * store, N is the channel's unread (`chatCounts − read`), the number its badge shows; a channel with none left (read
 * elsewhere meanwhile) says nothing. With no store (a replay), N is what arrived.
 */
export function unreadToAnnounce(
  arrived: ReadonlyMap<ChannelId, number>,
  counts: PlayerView["chatCounts"],
  read: Readonly<ChatRead> | null,
  unheard?: PlayerView["chatUnheard"],
): [ChannelId, number][] {
  if (!read) return [...arrived];
  return [...arrived.keys()].flatMap((c): [ChannelId, number][] => {
    const n = unreadCount(counts, read, c, unheard);
    return n > 0 ? [[c, n]] : [];
  });
}
