// Loading a replay (#369, docs/plans/replay-viewer.md, story 3): the bookkeeping behind `useReplay`, as a pure reducer
// so it is tested without React or a network. The hook does the fetching and the timers; this decides what to fetch,
// what to keep, when to retry, and which frame is on screen.
//
// Positions are record positions (`input:<seq>`, the index's `firstInput`), so they don't depend on how the history is
// chunked: -1 is the launch state before input 0 (chunk 0's first `base`), and the last input is the end.

import {
  type BuildStamp,
  type ChunkEntry,
  type FinishedGame,
  type FullView,
  HISTORY_VERSION,
  type HistoryFrame,
  type ReplayIndex,
} from "@mush2/shared";

/** How long the position must rest before a chunk it needs is fetched (dragging the scrubber, holding PageDown). */
export const SETTLE_MS = 200;
/** Chunks kept on each side of the settled one; the rest are dropped (public ones come back from the browser cache). */
export const KEEP_AROUND = 2;
/** The waits before retrying a `409 not_ready` index; then the page offers Retry. Also a `429` with no `Retry-After`. */
export const BACKOFF_MS = [1000, 2000, 4000, 8000, 15_000] as const;

/** A fetched chunk, rebuilt once (`rebuildHistory`): a frame per input, and each input's server time. */
export interface LoadedChunk {
  frames: readonly HistoryFrame[];
  at: readonly number[];
}

/** The frame on screen. */
export interface Step {
  /** Its record position; -1 for the launch state. */
  seq: number;
  /** The chunk it is in. */
  chunk: number;
  /** Server time (ms) of its input (the first input's for the launch state). */
  at: number;
  /** As recorded: show it through `readFrame`. */
  view: FullView;
  build: BuildStamp | null;
}

/**
 * What the page shows instead of (or before) the replay. `preparing` is a `409 not_ready` with a retry pending;
 * `notReady` is the same after every retry, with a Retry button; `failed` is a network error or an unexpected answer.
 * `notFound` is the same for a game that doesn't exist, hasn't ended, or is private (the server doesn't say which).
 */
export type ReplayStatus = "loading" | "preparing" | "notReady" | "notFound" | "failed" | "tooOld" | "ready";

/** Why a request failed, from its answer. */
export type Failure = { kind: "notFound" } | { kind: "notReady" } | { kind: "rateLimited"; retryAfterMs: number | null } | { kind: "error" };

export interface ReplayState {
  status: ReplayStatus;
  /** A `429` retry is pending: "Too many requests, retrying…". */
  rateLimited: boolean;
  /** A retry the hook should schedule: after `delayMs`, dispatch `retryDue`. */
  retry: { target: "index" | "chunks"; delayMs: number } | null;
  /** Retries so far of the current failure (the backoff's position). */
  attempt: number;
  /** Bumped to fetch the index again (a retry). Chunks need none: `wantedChunks` is empty while a retry waits. */
  indexToken: number;
  index: ReplayIndex | null;
  summary: FinishedGame | null;
  chunks: Readonly<Record<number, LoadedChunk>>;
  /** The position asked for, under the thumb while dragging. */
  position: number;
  /** The position once it has rested (`SETTLE_MS`), or at once when its chunk is loaded. Chunks are fetched for it. */
  settled: number;
  /** The last frame shown. While the position's chunk loads it stays on screen, dimmed (`stale`). */
  shown: Step | null;
}

export type ReplayAction =
  | { type: "index"; index: ReplayIndex }
  | { type: "indexFailed"; failure: Failure }
  | { type: "summary"; summary: FinishedGame }
  | { type: "seek"; seq: number }
  | { type: "settle" }
  | { type: "chunk"; n: number; chunk: LoadedChunk }
  | { type: "chunkFailed"; failure: Failure }
  | { type: "retryDue" }
  | { type: "retry" }
  | { type: "tooOld" };

/** The state before anything is fetched. `start` is a position to open at (a deep link), clamped once the index comes. */
export function initialReplayState(start = -1): ReplayState {
  return {
    status: "loading",
    rateLimited: false,
    retry: null,
    attempt: 0,
    indexToken: 0,
    index: null,
    summary: null,
    chunks: {},
    position: start,
    settled: start,
    shown: null,
  };
}

/** Whether this build reads the index's history format. A mismatch shows the summary instead (no migrations of it). */
export function readableIndex(index: Pick<ReplayIndex, "v">): boolean {
  return index.v === HISTORY_VERSION;
}

/** The last record position (the final input). */
export function lastSeq(index: Pick<ReplayIndex, "chunks">): number {
  const last = index.chunks.at(-1);
  return last ? last.firstInput + last.inputs - 1 : -1;
}

/** `seq` within -1 (the launch state) and the last input. */
export function clampSeq(index: Pick<ReplayIndex, "chunks">, seq: number): number {
  return Math.max(-1, Math.min(lastSeq(index), Math.trunc(seq)));
}

/** The chunk holding `seq`; the launch state (-1) is chunk 0's. The index's chunks are in record order. */
export function chunkOf(index: Pick<ReplayIndex, "chunks">, seq: number): number {
  const { chunks } = index;
  let lo = 0;
  let hi = chunks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (chunks[mid]!.firstInput <= seq) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The game cycle at `seq`: the cycle bar's label, read from the index alone (also under the thumb while dragging). */
export function cycleAt(index: Pick<ReplayIndex, "chunks">, seq: number): number | null {
  return index.chunks[chunkOf(index, seq)]?.cycle ?? null;
}

/** The chunks kept around chunk `n`: it and `KEEP_AROUND` on each side. */
export function keptAround(n: number, count: number): Set<number> {
  const kept = new Set<number>();
  for (let c = Math.max(0, n - KEEP_AROUND); c <= Math.min(count - 1, n + KEEP_AROUND); c++) kept.add(c);
  return kept;
}

/**
 * The chunks to fetch now: the settled position's, then the next in the background. Nothing while the index isn't
 * readable or a retry is pending. The hook aborts any fetch no longer listed.
 */
export function wantedChunks(state: ReplayState): number[] {
  const { index } = state;
  if (!index || state.status !== "ready" || state.retry) return [];
  const n = chunkOf(index, state.settled);
  return [n, n + 1].filter((c) => c < index.chunks.length && !(c in state.chunks));
}

/** The frame at `seq`, if its chunk is loaded. */
export function stepAt(index: Pick<ReplayIndex, "chunks">, chunks: Readonly<Record<number, LoadedChunk>>, seq: number): Step | null {
  const n = chunkOf(index, seq);
  const chunk = chunks[n];
  const info = index.chunks[n];
  if (!chunk || !info) return null;
  if (seq < info.firstInput) {
    // Only the launch state is before chunk 0's first input: the state the room loaded (`base`). A record that starts
    // with a full copy (a new ship's first join) has nothing earlier, so the launch state shows its first frame.
    const first = chunk.frames[0];
    if (!first) return null;
    return { seq, chunk: n, at: chunk.at[0] ?? info.from, view: first.base ?? first.view, build: first.build };
  }
  const i = seq - info.firstInput;
  const frame = chunk.frames[i];
  if (!frame) return null;
  return { seq, chunk: n, at: chunk.at[i] ?? info.to, view: frame.view, build: frame.build };
}

/**
 * The wait before retrying, or null to stop and offer Retry. A `429` waits its `Retry-After` when it has one, else
 * the backoff, and never gives up (its last wait repeats); a `409 not_ready` gives up after the backoff.
 */
export function retryDelay(failure: Failure, attempt: number): number | null {
  if (failure.kind === "rateLimited") return failure.retryAfterMs ?? BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;
  if (failure.kind === "notReady") return BACKOFF_MS[attempt] ?? null;
  return null;
}

/** Whether a frame was recorded by another build than this one: a small badge, since it may be shown wrong. */
export function olderBuild(build: BuildStamp | null, current: string): boolean {
  return build === null || build.rulesVersion !== current;
}

/** `shown` updated to the position's frame when its chunk is loaded. */
function show(state: ReplayState): ReplayState {
  if (!state.index) return state;
  const step = stepAt(state.index, state.chunks, state.position);
  return step ? { ...state, shown: step } : state;
}

/** A failure's state: a retry scheduled, or the notice that ends it. */
function failed(state: ReplayState, failure: Failure, target: "index" | "chunks"): ReplayState {
  if (failure.kind === "notFound" && target === "index") return { ...state, status: "notFound", retry: null, rateLimited: false };
  const delayMs = retryDelay(failure, state.attempt);
  if (delayMs === null) {
    const status = failure.kind === "notReady" && target === "index" ? "notReady" : "failed";
    return { ...state, status, retry: null, rateLimited: false };
  }
  return {
    ...state,
    status: target === "index" && failure.kind === "notReady" ? "preparing" : state.status,
    rateLimited: failure.kind === "rateLimited",
    retry: { target, delayMs },
    attempt: state.attempt + 1,
  };
}

export function replayReducer(state: ReplayState, action: ReplayAction): ReplayState {
  switch (action.type) {
    case "index": {
      const { index } = action;
      if (!readableIndex(index)) return { ...state, index, status: "tooOld", retry: null, rateLimited: false };
      const position = clampSeq(index, state.position);
      return { ...state, index, status: "ready", retry: null, rateLimited: false, attempt: 0, position, settled: position };
    }
    case "indexFailed":
      return failed(state, action.failure, "index");
    case "summary":
      return { ...state, summary: action.summary };
    case "seek": {
      if (!state.index) return state;
      const position = clampSeq(state.index, action.seq);
      const loaded = chunkOf(state.index, position) in state.chunks;
      // A loaded chunk shows at once; otherwise wait for the position to rest before fetching.
      return show({ ...state, position, settled: loaded ? position : state.settled });
    }
    case "settle":
      return state.settled === state.position ? state : { ...state, settled: state.position };
    case "chunk": {
      if (!state.index) return state;
      const kept = keptAround(chunkOf(state.index, state.settled), state.index.chunks.length);
      // Arrived for a position since left behind (the hook aborts those, but one may finish first).
      if (!kept.has(action.n)) return state;
      const chunks: Record<number, LoadedChunk> = {};
      for (const [n, chunk] of Object.entries(state.chunks)) if (kept.has(Number(n))) chunks[Number(n)] = chunk;
      chunks[action.n] = action.chunk;
      return show({ ...state, chunks, attempt: 0, rateLimited: false });
    }
    case "chunkFailed":
      return failed(state, action.failure, "chunks");
    case "retryDue":
      if (!state.retry) return state;
      return state.retry.target === "index" ? { ...state, retry: null, indexToken: state.indexToken + 1 } : { ...state, retry: null };
    case "retry": {
      if (state.status !== "notReady" && state.status !== "failed") return state;
      const base = { ...state, retry: null, rateLimited: false, attempt: 0 };
      return state.index
        ? { ...base, status: "ready" }
        : { ...base, status: "loading", indexToken: state.indexToken + 1 };
    }
    case "tooOld":
      return { ...state, status: "tooOld", retry: null, rateLimited: false };
  }
}

/** A fetched chunk's entries, rebuilt into frames. Throws `HistoryError` for a history this build can't read. */
export function loadChunk(entries: readonly ChunkEntry[], rebuild: (steps: ChunkEntry["history"][]) => HistoryFrame[]): LoadedChunk {
  return { frames: rebuild(entries.map((e) => e.history)), at: entries.map((e) => e.at) };
}
