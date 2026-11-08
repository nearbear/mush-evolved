import { type ChunkInfo, type FullView, type HistoryFrame, type Mark, type ReplayIndex } from "@mush2/shared";
import { describe, expect, it } from "vitest";
import type { LoadedChunk } from "../../src/replay/replayState.ts";
import {
  type ChunkMarks,
  cycleStart,
  dayAt,
  marksOf,
  nextCycle,
  nextStop,
  ownsKey,
  parseReplayParams,
  playInterval,
  prevCycle,
  prevStop,
  replayParams,
  transportKey,
} from "../../src/replay/transport.ts";

// Three chunks of 10 inputs: chunk n is cycle n + 1 and holds inputs 10n..10n + 9.
function makeIndex(count = 3): ReplayIndex {
  const chunks: ChunkInfo[] = Array.from({ length: count }, (_, n) => ({ cycle: n + 1, firstInput: n * 10, inputs: 10, from: n * 1000, to: n * 1000 + 900 }));
  return { v: 1, roomId: "r", rulesVersion: "abc", endedAt: 0, seats: [], chunks };
}
const index = makeIndex();

// Marks as stepMarks gives them: every chunk starts with a cycle mark (its full copy); chunk 0 has a chat at 3 and a
// plain line at 6, chunk 1 a death at 14, chunk 2 a plain line at 25.
const mark = (step: number, kind: Mark["kind"]): Mark => ({ step, kind });
const all: ChunkMarks = {
  0: [mark(0, "cycle"), mark(3, "chat"), mark(6, "other")],
  1: [mark(10, "cycle"), mark(14, "death")],
  2: [mark(20, "cycle"), mark(25, "other")],
};
const only = (...ns: number[]): ChunkMarks => Object.fromEntries(ns.map((n) => [n, all[n]!]));

describe("stops", () => {
  it("steps every input raw, from the launch state to the end", () => {
    expect(nextStop(index, {}, -1, "raw")).toBe(0);
    expect(nextStop(index, {}, 28, "raw")).toBe(29);
    expect(nextStop(index, {}, 29, "raw")).toBeNull();
    expect(prevStop(index, {}, 0, "raw")).toBe(-1);
    expect(prevStop(index, {}, -1, "raw")).toBeNull();
  });

  it("skips to each mark, then the next chunk's start, and ends at the last input", () => {
    const stops: number[] = [];
    for (let pos: number | null = -1; pos !== null; pos = nextStop(index, all, pos, "skip")) stops.push(pos);
    expect(stops).toEqual([-1, 0, 3, 6, 10, 14, 20, 25, 29]);
  });

  it("skips back through the same stops to the launch state", () => {
    const stops: number[] = [];
    for (let pos: number | null = 29; pos !== null; pos = prevStop(index, all, pos, "skip")) stops.push(pos);
    expect(stops).toEqual([29, 25, 20, 14, 10, 6, 3, 0, -1]);
  });

  it("goes to the next chunk's start when its marks aren't loaded, and waits when its own aren't", () => {
    expect(nextStop(index, only(0), 7, "skip")).toBe(10);
    expect(nextStop(index, only(1), 7, "skip")).toBeNull();
    expect(prevStop(index, only(1), 10, "skip")).toBe(-1);
    expect(prevStop(index, only(2), 20, "skip")).toBe(10);
    expect(prevStop(index, only(0), 12, "skip")).toBeNull();
  });

  it("stops only on events, and moves to the first chunk ahead that isn't loaded", () => {
    expect(nextStop(index, all, -1, "event")).toBe(3);
    expect(nextStop(index, all, 3, "event")).toBe(14);
    expect(nextStop(index, all, 14, "event")).toBe(29);
    expect(nextStop(index, only(0), 3, "event")).toBe(10);
    expect(nextStop(index, only(0, 1), 3, "event")).toBe(14);
    expect(nextStop(index, only(0, 1), 14, "event")).toBe(20);
    expect(prevStop(index, all, 29, "event")).toBe(14);
    expect(prevStop(index, all, 14, "event")).toBe(3);
    expect(prevStop(index, all, 3, "event")).toBe(-1);
    expect(prevStop(index, only(1, 2), 25, "event")).toBe(14);
    expect(prevStop(index, only(2), 25, "event")).toBe(10);
  });
});

describe("cycles", () => {
  it("starts chunk 0 at the launch state, the others at their first input", () => {
    expect([0, 1, 2].map((n) => cycleStart(index, n))).toEqual([-1, 10, 20]);
  });
  it("jumps to the next cycle's start, and back to this one's before the one before", () => {
    expect(nextCycle(index, -1)).toBe(10);
    expect(nextCycle(index, 15)).toBe(20);
    expect(nextCycle(index, 25)).toBeNull();
    expect(prevCycle(index, 25)).toBe(20);
    expect(prevCycle(index, 20)).toBe(10);
    expect(prevCycle(index, 10)).toBe(-1);
    expect(prevCycle(index, 5)).toBe(-1);
    expect(prevCycle(index, -1)).toBeNull();
  });
  it("labels the day and cycle of a position from the index", () => {
    const long = makeIndex(10);
    expect(dayAt(long, -1, { cyclesPerDay: 8 })).toEqual({ day: 1, cycleOfDay: 1 });
    expect(dayAt(long, 85, { cyclesPerDay: 8 })).toEqual({ day: 2, cycleOfDay: 1 });
    expect(dayAt(long, 95, { cyclesPerDay: 8 })).toEqual({ day: 2, cycleOfDay: 2 });
  });
});

describe("marksOf", () => {
  // Stand-in frames: stepMarks reads only cycle, log and chat ids and keys.
  const view = (cycle: number, log: number[]) => ({ cycle, log: log.map((id) => ({ id, cycle, key: "said" })), chat: [] }) as unknown as FullView;
  const chunk = (cycle: number, logs: number[][]): LoadedChunk => ({
    frames: logs.map((log): HistoryFrame => ({ view: view(cycle, log), build: null })),
    at: logs.map(() => 0),
  });

  it("marks each loaded chunk, and reuses a chunk's marks until the chunk before it changes", () => {
    const c0 = chunk(1, [[1], [1], [1, 2]]);
    const c1 = chunk(2, [[1, 2, 3], [1, 2, 3]]);
    const idx = { chunks: [{ cycle: 1, firstInput: 0, inputs: 3, from: 0, to: 0 }, { cycle: 2, firstInput: 3, inputs: 2, from: 0, to: 0 }] };
    const first = marksOf({ 0: c0, 1: c1 }, idx);
    expect(first[0]).toEqual([mark(0, "cycle"), mark(2, "other")]);
    expect(first[1]).toEqual([mark(3, "cycle")]);
    expect(marksOf({ 0: c0, 1: c1 }, idx)[1]).toBe(first[1]);
    // Without the chunk before, its first step is still a cycle's copy, but compared with nothing.
    const alone = marksOf({ 1: c1 }, idx);
    expect(alone[1]).toEqual([mark(3, "cycle")]);
    expect(alone[1]).not.toBe(first[1]);
    expect(alone[0]).toBeUndefined();
  });
});

describe("playback", () => {
  it("waits a second per stop with skip on, a quarter per input raw, divided by the speed", () => {
    expect(playInterval(1, true)).toBe(1000);
    expect(playInterval(4, true)).toBe(250);
    expect(playInterval(1, false)).toBe(250);
    expect(playInterval(2, false)).toBe(125);
  });
});

describe("URL", () => {
  it("round-trips a moment", () => {
    for (const moment of [
      { input: -1, seat: "p0", allSeeing: true },
      { input: 42, seat: "p12", allSeeing: false },
    ]) {
      expect(parseReplayParams(replayParams(moment).toString())).toEqual(moment);
    }
    expect(replayParams({ input: 3, seat: "p1", allSeeing: false }).toString()).toBe("input=3&seat=p1");
    expect(replayParams({ input: 3, seat: "p1", allSeeing: true }).toString()).toBe("input=3&seat=p1&reveal=1");
  });

  it("defaults to all-seeing at the launch state, and drops junk", () => {
    expect(parseReplayParams("")).toEqual({ seat: null, allSeeing: true });
    expect(parseReplayParams("?input=abc&seat=<script>&reveal=yes")).toEqual({ seat: null, allSeeing: true });
    expect(parseReplayParams("?input=-5&seat=p1&reveal=0")).toEqual({ seat: "p1", allSeeing: false });
    expect(parseReplayParams("?input=1.5")).toEqual({ seat: null, allSeeing: true });
    expect(parseReplayParams("?input=99999999999")).toEqual({ seat: null, allSeeing: true });
  });
});

describe("keyboard", () => {
  const key = (k: string, mods: Partial<Record<"shiftKey" | "ctrlKey" | "altKey" | "metaKey", boolean>> = {}) =>
    transportKey({ key: k, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...mods });

  it("binds arrows, Shift+arrows, PageUp/PageDown and Space, with no other modifier", () => {
    expect(["ArrowLeft", "ArrowRight", "PageUp", "PageDown", " "].map((k) => key(k))).toEqual(["stepBack", "stepForward", "cycleBack", "cycleForward", "playPause"]);
    expect(key("ArrowLeft", { shiftKey: true })).toBe("eventBack");
    expect(key("ArrowRight", { shiftKey: true })).toBe("eventForward");
    expect(key("ArrowRight", { ctrlKey: true })).toBeNull();
    expect(key("ArrowLeft", { altKey: true })).toBeNull();
    expect(key("Enter")).toBeNull();
  });

  // A stand-in element: `closest` matches when any selector in the list is one it is "inside".
  const inside = (...selectors: string[]) => ({
    closest: (list: string) => (list.split(",").some((s) => selectors.includes(s.trim())) ? ({} as Element) : null),
  });

  it("leaves keys to text fields, sliders, tabs and scroll areas, and Space to buttons", () => {
    for (const where of ["input", "textarea", "select", '[role="slider"]', '[role="tablist"]', ".scroll-viewport"]) {
      expect(ownsKey(inside(where), "ArrowLeft"), where).toBe(true);
    }
    expect(ownsKey(inside("button"), " ")).toBe(true);
    expect(ownsKey(inside("button"), "ArrowLeft")).toBe(false);
    expect(ownsKey(inside(), " ")).toBe(false);
    expect(ownsKey(null, " ")).toBe(false);
  });
});
