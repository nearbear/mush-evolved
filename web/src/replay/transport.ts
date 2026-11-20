// The replay page's transport (#370, docs/plans/replay-viewer.md, story 4), as pure functions so it is tested
// without React or a DOM: where step, skip, event and cycle buttons go, the cycle label, the playback speed, the URL,
// and which keys the page binds. The page (ReplayPage.tsx) and the bar (Transport.tsx) only call these.
//
// Positions are record positions, as in replayState.ts: -1 is the launch state, the last input the end.
//
// Stops depend on marks (shared `stepMarks`), which are only known for loaded chunks. A chunk's first input starts a
// cycle (a full copy), so it is a stop known from the index alone: when the marks ahead aren't loaded yet, the
// buttons go there, which loads that chunk. When the position's own chunk isn't loaded, they wait (null).

import { dayOf, type GameConfig, type FullView, type Mark, type MarkKind, type ReplayIndex, stepMarks } from "@mush2/shared";
import { chunkOf, lastSeq, type LoadedChunk } from "./replayState.ts";

// ---- Marks ---------------------------------------------------------------------

/** The marks that count as events (owner, 2026-11-08): Shift+arrows and the event buttons stop only on these. */
export const EVENT_KINDS: ReadonlySet<MarkKind> = new Set<MarkKind>(["death", "conversion", "fire", "chat"]);

/** Each loaded chunk's marks, by chunk number. Unloaded chunks are missing. */
export type ChunkMarks = Readonly<Record<number, readonly Mark[]>>;

/** `stepMarks` per chunk, kept as long as the chunk is, and redone only when the chunk before it comes or goes. */
const markCache = new WeakMap<LoadedChunk, { before: Readonly<FullView> | undefined; marks: readonly Mark[] }>();

/**
 * The marks of every loaded chunk. A chunk's first step is compared with the last frame of the chunk before when
 * that one is loaded; without it, the lines its first input added are the ones the server stamped at `info.from` or later.
 */
export function marksOf(chunks: Readonly<Record<number, LoadedChunk>>, index: Pick<ReplayIndex, "chunks">): ChunkMarks {
  const out: Record<number, readonly Mark[]> = {};
  for (const [key, chunk] of Object.entries(chunks)) {
    const n = Number(key);
    const info = index.chunks[n];
    if (!info) continue;
    const before = chunks[n - 1]?.frames.at(-1)?.view;
    const cached = markCache.get(chunk);
    if (cached && cached.before === before) {
      out[n] = cached.marks;
      continue;
    }
    const marks = stepMarks(chunk.frames, info.firstInput, before, info.from);
    markCache.set(chunk, { before, marks });
    out[n] = marks;
  }
  return out;
}

// ---- Stops ---------------------------------------------------------------------

/** Raw steps every input; skip stops on every mark; event only on `EVENT_KINDS` marks. */
export type StopMode = "raw" | "skip" | "event";

type Index = Pick<ReplayIndex, "chunks">;

/** Where chunk `n` starts: its first input, or the launch state (-1) for chunk 0. */
export function cycleStart(index: Index, n: number): number {
  return n === 0 ? -1 : index.chunks[n]!.firstInput;
}

const wanted = (mode: StopMode) => (m: Mark) => mode === "skip" || EVENT_KINDS.has(m.kind);

/**
 * The next stop after `pos`, or null (at the end, or `pos`'s chunk isn't loaded yet: the button waits).
 * - raw: the next input.
 * - skip: the next mark of `pos`'s chunk, else the next chunk's start.
 * - event: the next event mark, looking through the loaded chunks ahead; at the first chunk ahead that isn't loaded,
 *   its start, so playback moves on and loads it.
 * Past the last mark of the game, the end is the last stop.
 */
export function nextStop(index: Index, marks: ChunkMarks, pos: number, mode: StopMode): number | null {
  const last = lastSeq(index);
  if (pos >= last) return null;
  if (mode === "raw") return pos + 1;
  const n = chunkOf(index, pos);
  if (!marks[n]) return null;
  const match = wanted(mode);
  for (let c = n; c < index.chunks.length; c++) {
    const own = marks[c];
    if (!own) return index.chunks[c]!.firstInput;
    const found = own.find((m) => m.step > pos && match(m));
    if (found) return found.step;
    if (mode === "skip" && c + 1 < index.chunks.length) return index.chunks[c + 1]!.firstInput;
  }
  return last;
}

/**
 * The stop before `pos`, the same backward: when the chunk behind isn't loaded, its start. The launch state (-1) is
 * the first stop. Null at the launch state, or when `pos`'s chunk isn't loaded.
 */
export function prevStop(index: Index, marks: ChunkMarks, pos: number, mode: StopMode): number | null {
  if (pos <= -1) return null;
  if (mode === "raw") return pos - 1;
  const n = chunkOf(index, pos);
  if (!marks[n]) return null;
  const match = wanted(mode);
  for (let c = n; c >= 0; c--) {
    const own = marks[c];
    if (!own) return cycleStart(index, c);
    for (let i = own.length - 1; i >= 0; i--) if (own[i]!.step < pos && match(own[i]!)) return own[i]!.step;
  }
  return -1;
}

/** PageDown: the next cycle's start, or null in the last one. */
export function nextCycle(index: Index, pos: number): number | null {
  const n = chunkOf(index, pos) + 1;
  return n < index.chunks.length ? cycleStart(index, n) : null;
}

/** PageUp: this cycle's start, or the one before when already there; null at the launch state. */
export function prevCycle(index: Index, pos: number): number | null {
  const n = chunkOf(index, pos);
  const own = cycleStart(index, n);
  if (pos > own) return own;
  return n > 0 ? cycleStart(index, n - 1) : null;
}

// ---- Labels ----------------------------------------------------------------------

/**
 * "Day 2 · cycle 3" for `pos`: the cycle from the index (so it follows the thumb while dragging) and the days from
 * the game's config (fixed for a game: read it from any frame shown).
 */
export function dayAt(index: Index, pos: number, config: Pick<GameConfig, "cyclesPerDay">): { day: number; cycleOfDay: number } | null {
  const cycle = index.chunks[chunkOf(index, pos)]?.cycle;
  return cycle === undefined ? null : dayOf({ cycle, config: config as GameConfig });
}

// ---- Playback -------------------------------------------------------------------

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/** Milliseconds between playback steps: a second per stop with skip on, a quarter per raw input, at 1×. */
export function playInterval(speed: Speed, skip: boolean): number {
  return (skip ? 1000 : 250) / speed;
}

// ---- URL ------------------------------------------------------------------------

/** What `?input=<seq>&seat=<seat>&reveal=1` asks for. Junk values are dropped. */
export interface ReplayParams {
  /** The position; missing opens at the launch state. */
  input?: number;
  /** The seat followed; missing is the index's first seat. */
  seat: string | null;
  /** All-seeing: `reveal=1`, or no seat at all (the page's default). A seat without `reveal` is its own view. */
  allSeeing: boolean;
}

const SEAT = /^[A-Za-z0-9_-]{1,32}$/;

export function parseReplayParams(search: string | URLSearchParams): ReplayParams {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const rawInput = params.get("input");
  const input = rawInput !== null && /^-?\d{1,9}$/.test(rawInput) ? Number(rawInput) : undefined;
  const rawSeat = params.get("seat");
  const seat = rawSeat !== null && SEAT.test(rawSeat) ? rawSeat : null;
  const allSeeing = params.get("reveal") === "1" || seat === null;
  return { ...(input !== undefined && input >= -1 && { input }), seat, allSeeing };
}

/** The URL for a moment: `reveal` only when all-seeing. */
export function replayParams({ input, seat, allSeeing }: { input: number; seat: string; allSeeing: boolean }): URLSearchParams {
  const params = new URLSearchParams({ input: String(input), seat });
  if (allSeeing) params.set("reveal", "1");
  return params;
}

// ---- Keyboard ---------------------------------------------------------------------

export type TransportKey = "stepBack" | "stepForward" | "eventBack" | "eventForward" | "cycleBack" | "cycleForward" | "playPause";

/** The page's bindings: ←/→ step, Shift+←/→ event, PageUp/PageDown cycle, Space play/pause. Other modifiers: none. */
export function transportKey(e: { key: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): TransportKey | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  switch (e.key) {
    case "ArrowLeft":
      return e.shiftKey ? "eventBack" : "stepBack";
    case "ArrowRight":
      return e.shiftKey ? "eventForward" : "stepForward";
    case "PageUp":
      return e.shiftKey ? null : "cycleBack";
    case "PageDown":
      return e.shiftKey ? null : "cycleForward";
    case " ":
      return e.shiftKey ? null : "playPause";
    default:
      return null;
  }
}

/** Where keys belong to the control itself: typing, a slider's arrows, tabs, a scroll area. */
const OWNS_KEYS = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="tablist"], .scroll-viewport';

/** Whether the page should leave `key` to the focused element: true inside a control that uses it, and Space on a button. */
export function ownsKey(target: Pick<Element, "closest"> | null, key: string): boolean {
  if (!target || typeof target.closest !== "function") return false;
  if (target.closest(OWNS_KEYS)) return true;
  return key === " " && target.closest('button, [role="button"], a[href], summary') !== null;
}
