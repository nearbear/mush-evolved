import { type ChunkInfo, type FullView, HISTORY_VERSION, type HistoryFrame, type ReplayIndex } from "@mush2/shared";
import { describe, expect, it } from "vitest";
import {
  BACKOFF_MS,
  chunkOf,
  clampSeq,
  cycleAt,
  initialReplayState,
  type LoadedChunk,
  olderBuild,
  type ReplayAction,
  replayReducer,
  type ReplayState,
  retryDelay,
  stepAt,
  wantedChunks,
} from "../../src/replay/replayState.ts";

// A game of `count` chunks of 10 inputs each, chunk n being cycle n + 1. Frames are stand-ins: the reducer never reads them.
const BUILD = { stateVersion: 1, rulesVersion: "abc" };
function makeIndex(count: number, v = HISTORY_VERSION): ReplayIndex {
  const chunks: ChunkInfo[] = Array.from({ length: count }, (_, n) => ({ cycle: n + 1, firstInput: n * 10, inputs: 10, from: n * 1000, to: n * 1000 + 900 }));
  return { v, roomId: "r", rulesVersion: "abc", endedAt: 0, seats: [], chunks };
}
const fake = (label: string) => ({ label }) as unknown as FullView;
function makeChunk(n: number): LoadedChunk {
  const frames: HistoryFrame[] = Array.from({ length: 10 }, (_, i) => ({ view: fake(`${n}:${i}`), build: BUILD }));
  if (n === 0) frames[0] = { ...frames[0]!, base: fake("launch") };
  return { frames, at: frames.map((_, i) => n * 1000 + i * 100) };
}
const run = (state: ReplayState, ...actions: ReplayAction[]) => actions.reduce(replayReducer, state);
const ready = (count = 10, start = -1) => run(initialReplayState(start), { type: "index", index: makeIndex(count) });
const label = (state: ReplayState) => (state.shown?.view as unknown as { label: string } | undefined)?.label;

describe("positions", () => {
  const index = makeIndex(3);
  it("finds the chunk of a record position, the launch state in chunk 0", () => {
    expect([-1, 0, 9, 10, 19, 20, 29].map((s) => chunkOf(index, s))).toEqual([0, 0, 0, 1, 1, 2, 2]);
    expect(cycleAt(index, 15)).toBe(2);
  });

  it("clamps to the launch state and the last input", () => {
    expect([clampSeq(index, -5), clampSeq(index, 99), clampSeq(index, 12.7)]).toEqual([-1, 29, 12]);
  });

  it("reads the launch state from chunk 0's base, and an input's frame and time", () => {
    const chunks = { 0: makeChunk(0), 1: makeChunk(1) };
    expect(stepAt(index, chunks, -1)).toMatchObject({ seq: -1, chunk: 0, at: 0, view: fake("launch") });
    // A record that starts with a full copy (a new ship's first join) has no earlier state: -1 shows its first frame.
    const { base: _launch, ...first } = chunks[0]!.frames[0]!;
    const fresh = { 0: { ...chunks[0]!, frames: [first, ...chunks[0]!.frames.slice(1)] } };
    expect(stepAt(index, fresh, -1)).toMatchObject({ seq: -1, chunk: 0, at: 0, view: fake("0:0") });
    expect(stepAt(index, chunks, 13)).toMatchObject({ seq: 13, chunk: 1, at: 1300, view: fake("1:3"), build: BUILD });
    expect(stepAt(index, chunks, 25)).toBeNull();
  });
});

describe("index", () => {
  it("is ready on a readable index, clamping a deep link", () => {
    const state = ready(3, 500);
    expect(state.status).toBe("ready");
    expect([state.position, state.settled]).toEqual([29, 29]);
  });

  it("shows the summary for another history format", () => {
    const state = run(initialReplayState(), { type: "index", index: makeIndex(3, HISTORY_VERSION + 1) });
    expect(state.status).toBe("tooOld");
    expect(wantedChunks(state)).toEqual([]);
  });

  it("is not found on a 404, whatever the reason", () => {
    expect(run(initialReplayState(), { type: "indexFailed", failure: { kind: "notFound" } }).status).toBe("notFound");
  });
});

describe("not ready and rate limits", () => {
  const notReady: ReplayAction = { type: "indexFailed", failure: { kind: "notReady" } };

  it("retries a 409 after 1, 2, 4, 8 and 15 s, then offers Retry", () => {
    let state = initialReplayState();
    const delays: number[] = [];
    for (;;) {
      state = run(state, notReady);
      if (!state.retry) break;
      expect(state.status).toBe("preparing");
      delays.push(state.retry.delayMs);
      const token = state.indexToken;
      state = run(state, { type: "retryDue" });
      expect(state.indexToken).toBe(token + 1);
    }
    expect(delays).toEqual([...BACKOFF_MS]);
    expect(state.status).toBe("notReady");
    state = run(state, { type: "retry" });
    expect(state).toMatchObject({ status: "loading", attempt: 0, retry: null });
    expect(run(state, notReady).retry?.delayMs).toBe(1000);
  });

  it("waits a 429's Retry-After, else the backoff, and never gives up", () => {
    expect(retryDelay({ kind: "rateLimited", retryAfterMs: 30_000 }, 0)).toBe(30_000);
    expect(retryDelay({ kind: "rateLimited", retryAfterMs: null }, 1)).toBe(2000);
    expect(retryDelay({ kind: "rateLimited", retryAfterMs: null }, 50)).toBe(15_000);
    expect(retryDelay({ kind: "notReady" }, 5)).toBeNull();
    expect(retryDelay({ kind: "error" }, 0)).toBeNull();
  });

  it("flags a rate-limited chunk, pauses fetching, and clears once a chunk arrives", () => {
    let state = run(ready(), { type: "chunkFailed", failure: { kind: "rateLimited", retryAfterMs: 5000 } });
    expect(state.rateLimited).toBe(true);
    expect(state.retry).toEqual({ target: "chunks", delayMs: 5000 });
    expect(wantedChunks(state)).toEqual([]);
    state = run(state, { type: "retryDue" });
    expect(wantedChunks(state)).toEqual([0, 1]);
    state = run(state, { type: "chunk", n: 0, chunk: makeChunk(0) });
    expect(state.rateLimited).toBe(false);
  });

  it("offers Retry after a failed chunk and fetches it again", () => {
    let state = run(ready(), { type: "chunkFailed", failure: { kind: "error" } });
    expect(state.status).toBe("failed");
    state = run(state, { type: "retry" });
    expect(state.status).toBe("ready");
    expect(wantedChunks(state)).toEqual([0, 1]);
  });
});

describe("chunks", () => {
  it("wants the position's chunk and the next, and stops wanting loaded ones", () => {
    let state = ready();
    expect(wantedChunks(state)).toEqual([0, 1]);
    state = run(state, { type: "chunk", n: 0, chunk: makeChunk(0) });
    expect(wantedChunks(state)).toEqual([1]);
    expect(label(state)).toBe("launch");
  });

  it("debounces: a jump to an unloaded chunk keeps the last frame, stale, until the position settles", () => {
    let state = run(ready(), { type: "chunk", n: 0, chunk: makeChunk(0) }, { type: "seek", seq: 3 });
    expect([state.settled, label(state)]).toEqual([3, "0:3"]);
    state = run(state, { type: "seek", seq: 45 }, { type: "seek", seq: 55 }, { type: "seek", seq: 62 });
    expect(state.position).toBe(62);
    expect(state.settled).toBe(3);
    expect(wantedChunks(state)).toEqual([1]);
    expect(label(state)).toBe("0:3");
    state = run(state, { type: "settle" });
    expect(wantedChunks(state)).toEqual([6, 7]);
    state = run(state, { type: "chunk", n: 6, chunk: makeChunk(6) });
    expect([state.shown?.seq, label(state)]).toEqual([62, "6:2"]);
  });

  it("keeps the settled chunk and 2 on each side, dropping the rest", () => {
    let state = ready();
    for (const n of [0, 1, 2]) state = run(state, { type: "chunk", n, chunk: makeChunk(n) });
    state = run(state, { type: "seek", seq: 35 }, { type: "settle" });
    for (const n of [3, 4]) state = run(state, { type: "chunk", n, chunk: makeChunk(n) });
    expect(Object.keys(state.chunks).map(Number)).toEqual([1, 2, 3, 4]);
  });

  it("ignores a chunk that arrives for a position left behind", () => {
    const state = run(ready(), { type: "seek", seq: 95 }, { type: "settle" }, { type: "chunk", n: 0, chunk: makeChunk(0) });
    expect(state.chunks).toEqual({});
  });

  it("shows a loaded chunk's frame at once when stepping into it", () => {
    let state = run(ready(), { type: "chunk", n: 0, chunk: makeChunk(0) }, { type: "chunk", n: 1, chunk: makeChunk(1) }, { type: "seek", seq: 9 });
    state = run(state, { type: "seek", seq: 10 });
    expect([state.settled, label(state)]).toEqual([10, "1:0"]);
    expect(wantedChunks(state)).toEqual([2]);
  });
});

describe("older builds", () => {
  it("badges a frame from another build, or one with no stamp", () => {
    expect(olderBuild(BUILD, "abc")).toBe(false);
    expect(olderBuild(BUILD, "def")).toBe(true);
    expect(olderBuild(null, "abc")).toBe(true);
  });
});
