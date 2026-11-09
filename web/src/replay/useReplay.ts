// Loading a replay (#369, docs/plans/replay-viewer.md, story 3): the index, the game's summary, and the chunks around
// the position on screen, with the view of the step shown. The bookkeeping is the pure reducer in replayState.ts; this
// hook adds the network and the timers.
//
// - The index first; the cycle bar draws from `index.chunks` alone.
// - A chunk is fetched once the position has rested (`SETTLE_MS`), with the next one in the background, and rebuilt
//   once (`rebuildHistory`). While dragging, nothing is fetched: the last frame stays, `stale` (dimmed).
//   A fetch no longer wanted is aborted (saves bandwidth and parsing; the server already counted it).
// - Only the settled chunk and 2 on each side are kept; the rest are dropped with their frames.
// - `409 not_ready` retries the index after 1, 2, 4, 8 and 15 s, then offers Retry; `429` retries after `Retry-After`.
// - The view is computed only for the step on screen, memoized, and shares unchanged parts with the last one.

import { type ChunkEntry, type FinishedGame, HistoryError, type PlayerId, type ReplayIndex, readFrame, rebuildHistory, type SeatAt, seatsAt } from "@mush2/shared";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { api } from "../account/api.ts";
import { shareUnchanged } from "../shareView.ts";
import {
  cycleAt,
  type Failure,
  type LoadedChunk,
  initialReplayState,
  loadChunk,
  olderBuild,
  replayReducer,
  type ReplayStatus,
  SETTLE_MS,
  type Step,
  wantedChunks,
} from "./replayState.ts";
import { readableChunk, type StepView, stepView } from "./replayViews.ts";

/** The build this client is (`RULES_VERSION`, web/vite.config.ts): frames recorded by another get a badge. */
const CURRENT_BUILD = __RULES_VERSION__;

/** Seconds from a 429's Retry-After, as milliseconds, or null if it's missing or odd. */
function retryAfterMs(headers: Headers): number | null {
  const seconds = Number(headers.get("Retry-After")); // i18n-ignore: an HTTP header
  return Number.isFinite(seconds) && seconds >= 1 ? seconds * 1000 : null;
}

/** A failed answer's kind. The rate limit is middleware in front of every route, so its 429 isn't in the route types. */
function failureOf(response: { status: number; headers: Headers }): Failure {
  if (response.status === 404) return { kind: "notFound" };
  if (response.status === 409) return { kind: "notReady" };
  if (response.status === 429) return { kind: "rateLimited", retryAfterMs: retryAfterMs(response.headers) };
  return { kind: "error" };
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

export interface ReplayOptions {
  /** The position to open at (a deep link); -1, the launch state, by default. */
  start?: number;
  /** The seat to follow; the index's first seat when null. */
  seat: PlayerId | null;
  /** All-seeing (`revealFor`) or the seat's own view (`perspective`). */
  allSeeing: boolean;
}

export interface Replay {
  status: ReplayStatus;
  /** A `429` retry is pending: "Too many requests, retrying…". */
  rateLimited: boolean;
  index: ReplayIndex | null;
  /** The game's entry in the games list (`GET /api/games/<id>`): the header, and the summary of a game too old to read. */
  summary: FinishedGame | null;
  /** The position asked for (under the thumb while dragging), and its cycle from the index. */
  position: number;
  cycle: number | null;
  /** The frame on screen, and whether it is an older position kept while the position's chunk loads (dim it). */
  step: Step | null;
  stale: boolean;
  /** The step's view for the chosen seat and mode; null while nobody is aboard (a ship's launch state). */
  view: StepView | null;
  /** Who plays whom at the step (the perspective switcher). Empty before the first frame, or while nobody is aboard. */
  seats: SeatAt[];
  /** The seat the view follows: the one asked for when it is aboard at the step, else the first aboard. */
  followed: PlayerId | null;
  /** The game's cycles per day, for day labels (fixed for a game); null before the first frame. */
  cyclesPerDay: number | null;
  /** The chunks loaded now, by number (the marks, the perspective switcher). Don't mutate them. */
  chunks: Readonly<Record<number, LoadedChunk>>;
  /** The step was recorded by another build than this one: it may be shown wrong. */
  olderBuild: boolean;
  seek: (seq: number) => void;
  /** After `notReady` or `failed`: try again. */
  retry: () => void;
}

export function useReplay(roomId: string, { start, seat, allSeeing }: ReplayOptions): Replay {
  const [state, dispatch] = useReducer(replayReducer, start, initialReplayState);
  const { index, status, retry: pendingRetry } = state;

  // The index, again on each token (a retry).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `indexToken` is a trigger: a retry fetches the index again.
  useEffect(() => {
    const abort = new AbortController();
    api.api.games[":id"].replay.$get({ param: { id: roomId } }, { init: { signal: abort.signal } }).then(
      async (response) => {
        if (response.ok) dispatch({ type: "index", index: (await response.json()) as ReplayIndex });
        else dispatch({ type: "indexFailed", failure: failureOf(response) });
      },
      (e: unknown) => isAbort(e) || dispatch({ type: "indexFailed", failure: { kind: "error" } }),
    );
    return () => abort.abort();
  }, [roomId, state.indexToken]);

  // The summary, once: the header, and what a game too old to read shows. Without it the notice shows alone.
  useEffect(() => {
    const abort = new AbortController();
    api.api.games[":id"].$get({ param: { id: roomId } }, { init: { signal: abort.signal } }).then(
      async (response) => {
        if (response.ok) dispatch({ type: "summary", summary: (await response.json()) as FinishedGame });
      },
      () => {},
    );
    return () => abort.abort();
  }, [roomId]);

  // A scheduled retry.
  useEffect(() => {
    if (!pendingRetry) return;
    const timer = setTimeout(() => dispatch({ type: "retryDue" }), pendingRetry.delayMs);
    return () => clearTimeout(timer);
  }, [pendingRetry]);

  // The position rests before its chunk is fetched.
  useEffect(() => {
    if (state.settled === state.position) return;
    const timer = setTimeout(() => dispatch({ type: "settle" }), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [state.position, state.settled]);

  // Chunks: start the wanted ones, abort the rest. In flight by chunk number.
  const inFlight = useRef(new Map<number, AbortController>());
  const checked = useRef(false);
  const firstSeat = index?.seats[0]?.seat;
  // By value: a new array each render would restart the effect. A retry empties the list while it waits, so the
  // chunks are asked for again when it is due.
  const wantedKey = wantedChunks(state).join();
  const wanted = useMemo(() => (wantedKey ? wantedKey.split(",").map(Number) : []), [wantedKey]);
  useEffect(() => {
    const flights = inFlight.current;
    for (const [n, abort] of flights) {
      if (!wanted.includes(n)) {
        abort.abort();
        flights.delete(n);
      }
    }
    for (const n of wanted) {
      if (flights.has(n)) continue;
      const abort = new AbortController();
      flights.set(n, abort);
      api.api.games[":id"].replay[":n"]
        .$get({ param: { id: roomId, n: String(n) } }, { init: { signal: abort.signal } })
        .then(async (response) => {
          if (!response.ok) return dispatch({ type: "chunkFailed", failure: failureOf(response) });
          const entries = (await response.json()) as ChunkEntry[];
          if (abort.signal.aborted) return;
          let chunk: ReturnType<typeof loadChunk>;
          try {
            chunk = loadChunk(entries, rebuildHistory);
          } catch (e) {
            if (e instanceof HistoryError) return dispatch({ type: "tooOld" });
            throw e;
          }
          // The first chunk loaded is read at once, so an unreadable game shows its summary at load, not mid-playback.
          if (!checked.current && firstSeat !== undefined) {
            checked.current = true;
            if (!readableChunk(chunk, firstSeat)) return dispatch({ type: "tooOld" });
          }
          dispatch({ type: "chunk", n, chunk });
        })
        .catch((e: unknown) => isAbort(e) || dispatch({ type: "chunkFailed", failure: { kind: "error" } }))
        .finally(() => {
          if (flights.get(n) === abort) flights.delete(n);
        });
    }
  }, [roomId, wanted, firstSeat]);

  // Leaving the page aborts everything.
  useEffect(() => {
    const flights = inFlight.current;
    return () => {
      for (const abort of flights.values()) abort.abort();
      flights.clear();
    };
  }, []);

  // The view of the step on screen only, memoized; unchanged parts keep the last view's objects.
  const step = state.shown;
  // Seats board during pre-selection, so the one asked for may not be aboard yet: follow the first that is.
  const full = useMemo(() => {
    if (!step || status !== "ready") return null;
    try {
      return readFrame(step);
    } catch (e) {
      if (e instanceof HistoryError) return null;
      throw e;
    }
  }, [step, status]);
  const seats = useMemo(() => (full && index ? seatsAt(full, index) : []), [full, index]);
  // An unreadable frame still goes to `stepView`, whose `HistoryError` shows the summary.
  const followed = full ? (seats.find((s) => s.seat === seat)?.seat ?? seats[0]?.seat ?? null) : (seat ?? firstSeat ?? null);
  const firstInputs = useMemo(() => index?.chunks.map((c) => c.firstInput) ?? [], [index]);
  // All-seeing reads the loaded chunks (its streams); a seat's own view doesn't, so prefetches don't recompute it.
  const streamChunks = allSeeing ? state.chunks : null;
  const last = useRef<StepView | null>(null);
  const computed = useMemo((): StepView | HistoryError | null => {
    if (!step || followed === null || status !== "ready") return null;
    try {
      return stepView(step, followed, allSeeing, streamChunks ?? {}, firstInputs);
    } catch (e) {
      if (e instanceof HistoryError) return e;
      throw e;
    }
  }, [step, followed, allSeeing, streamChunks, firstInputs, status]);
  const unreadable = computed instanceof HistoryError;
  useEffect(() => {
    if (unreadable) dispatch({ type: "tooOld" });
  }, [unreadable]);
  const view = useMemo(() => {
    if (computed === null || computed instanceof HistoryError) return null;
    const shared = shareUnchanged(last.current, computed);
    last.current = shared;
    return shared;
  }, [computed]);

  const seek = useCallback((seq: number) => dispatch({ type: "seek", seq }), []);
  const retry = useCallback(() => dispatch({ type: "retry" }), []);

  return {
    status,
    rateLimited: state.rateLimited,
    index,
    summary: state.summary,
    position: state.position,
    cycle: index ? cycleAt(index, state.position) : null,
    step,
    stale: step !== null && step.seq !== state.position,
    view,
    seats,
    followed,
    cyclesPerDay: full?.config.cyclesPerDay ?? null,
    chunks: state.chunks,
    olderBuild: step !== null && olderBuild(step.build, CURRENT_BUILD),
    seek,
    retry,
  };
}
