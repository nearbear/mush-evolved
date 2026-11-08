import { type FullView, fullViewFor, type GameState, historyStep, pushLog, rebuildHistory, seatStarts, STATE_VERSION } from "@mush2/shared";
import { describe, expect, it } from "vitest";
import { sampleState } from "../../src/designKit/sampleView.ts";
import { type LoadedChunk, stepAt } from "../../src/replay/replayState.ts";
import { readableChunk, stepView } from "../../src/replay/replayViews.ts";

const BUILD = { stateVersion: STATE_VERSION, rulesVersion: "test" };
const at = (frames: LoadedChunk["frames"]) => frames.map((_, i) => i);

// Two chunks from a real launched ship. In chunk 0, a line in p0's room that only p1 saw is written; at the cycle copy
// that starts chunk 1, the full view has dropped it (as the room log trim would), so only the streams still hold it.
function game() {
  const state = sampleState();
  const starts = seatStarts(state);
  const follower = state.players[0]!;
  const witness = state.players[1]!;
  const full0 = fullViewFor(state, starts);
  const s1 = structuredClone(state) as GameState;
  pushLog(s1, { key: "noticed", room: follower.room, visibleTo: [witness.id] });
  const hidden = s1.log.at(-1)!.id;
  const full1 = fullViewFor(s1, starts);
  const s2 = structuredClone(s1) as GameState;
  s2.log = s2.log.filter((e) => e.id !== hidden);
  const full2: FullView = fullViewFor(s2, starts);
  const chunk0Frames = rebuildHistory([historyStep(null, () => full0, full1, false, BUILD)]);
  const chunk1Frames = rebuildHistory([historyStep(full1, () => full1, full2, true, BUILD)]);
  const chunks: Record<number, LoadedChunk> = {
    0: { frames: chunk0Frames, at: at(chunk0Frames) },
    1: { frames: chunk1Frames, at: at(chunk1Frames) },
  };
  const index = {
    chunks: [
      { cycle: 1, firstInput: 0, inputs: 1, from: 0, to: 0 },
      { cycle: 2, firstInput: 1, inputs: 1, from: 1, to: 1 },
    ],
  };
  return { chunks, index, firstInputs: [0, 1], follower: follower.mind, hidden };
}

describe("stepView", () => {
  it("shows a hidden line of the followed room in all-seeing only, from earlier frames once the full view dropped it", () => {
    const { chunks, index, firstInputs, follower, hidden } = game();
    const step = stepAt(index, chunks, 1)!;
    const ids = (v: { view: { log: { id: number }[] } }) => v.view.log.map((e) => e.id);
    expect(ids(stepView(step, follower, true, chunks, firstInputs))).toContain(hidden);
    expect(ids(stepView(step, follower, false, chunks, firstInputs))).not.toContain(hidden);
    // Without the chunk before, only what the frame itself still holds.
    expect(ids(stepView(step, follower, true, { 1: chunks[1]! }, firstInputs))).not.toContain(hidden);
  });

  it("gives the seat's own view no reveal, and all-seeing every seat's hidden side", () => {
    const { chunks, index, firstInputs, follower } = game();
    const step = stepAt(index, chunks, -1)!;
    expect(stepView(step, follower, false, chunks, firstInputs).reveal).toBeNull();
    expect(Object.keys(stepView(step, follower, true, chunks, firstInputs).reveal!.seats)).toHaveLength(16);
  });

  it("reads each entry once, so showing a step again keeps its entries' identity", () => {
    const { chunks, index, firstInputs, follower } = game();
    const step = stepAt(index, chunks, 1)!;
    const a = stepView(step, follower, true, chunks, firstInputs).view.log;
    const b = stepView(step, follower, true, chunks, firstInputs).view.log;
    expect(b[0]).toBe(a[0]);
  });
});

describe("readableChunk", () => {
  it("reads a chunk this build recorded", () => {
    const { chunks, follower } = game();
    expect(readableChunk(chunks[0]!, follower)).toBe(true);
  });

  it("refuses a frame from a newer build", () => {
    const { chunks, follower } = game();
    const frames = chunks[0]!.frames.map((f) => ({ ...f, build: { stateVersion: STATE_VERSION + 1, rulesVersion: "next" } }));
    expect(readableChunk({ frames, at: [0] }, follower)).toBe(false);
  });
});
