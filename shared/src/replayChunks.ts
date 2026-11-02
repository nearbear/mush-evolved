// A finished game's history as it is copied to R2 (#336, docs/rules/rules-design.md "Replay history and storage"):
// per-cycle chunks plus a small index. Here so the server that writes them and the viewer that reads them (#337) share
// the types.
//
// A chunk starts at a step that carries a full copy of the view: each `cycle` input's copy, and the launch's first
// input's `base`. So every chunk rebuilds by itself (`rebuildHistory`). A room restart mid-cycle adds a `base` step
// inside a chunk, which `rebuildHistory` already reads.
//
// Only the history leaves the room: never the input itself, the text before moderation (`raw`), message ids, accounts
// or blocked text. The replay is made from the full view alone, so nothing beyond what that view shows is copied.

import type { PlayerId } from "./types.ts";
import type { RecordedInput } from "./replay.ts";
import type { SeatStart } from "./fullView.ts";
import { HISTORY_VERSION, HistoryError, type HistoryStep } from "./viewHistory.ts";

/** One input in a chunk: its server time (ms) and its history step. */
export interface ChunkEntry {
  at: number;
  history: HistoryStep;
}

/** Where a chunk sits in the game, as the index lists it. */
export interface ChunkInfo {
  /** The game cycle (`GameState.cycle`) of the copy the chunk starts from. */
  cycle: number;
  /** The record position (`input:<seq>`) of the chunk's first input. */
  firstInput: number;
  /** How many inputs the chunk holds. */
  inputs: number;
  /** Server time (ms) of its first and last input. */
  from: number;
  to: number;
}

export interface ReplayChunk {
  info: ChunkInfo;
  entries: ChunkEntry[];
}

/** A seat in the index: who it was when the Mush were chosen. No names (the viewer moderates the full view's). */
export interface IndexSeat extends SeatStart {
  seat: PlayerId;
}

/** The index of a copied game, written after every chunk. */
export interface ReplayIndex {
  /** `HISTORY_VERSION` of the steps in every chunk. */
  v: number;
  roomId: string;
  rulesVersion: string;
  endedAt: number;
  seats: IndexSeat[];
  chunks: ChunkInfo[];
}

/** The cycle of a step's copy, or null for a step that is only a change (it can't start a chunk). */
function copyCycle(step: HistoryStep): number | null {
  if ("full" in step) return step.full.cycle;
  if ("base" in step) return step.base.cycle;
  return null;
}

/**
 * Splits a record into chunks as it is read in order, so the server can page through storage instead of loading the
 * whole record. `add` returns the chunk the entry closed, if any; `finish` returns the last one.
 */
export class ChunkBuilder {
  private current: ReplayChunk | null = null;

  add(seq: number, recorded: Pick<RecordedInput, "at" | "history">): ReplayChunk | null {
    const { at, history } = recorded;
    if (history === undefined) throw new HistoryError(`Input ${seq} has no history`);
    if ("v" in history && history.v !== HISTORY_VERSION) throw new HistoryError(`Input ${seq} is format ${history.v}, not ${HISTORY_VERSION}`);
    const entry: ChunkEntry = { at, history };
    const closes = "full" in history || this.current === null;
    if (!closes) {
      this.current!.entries.push(entry);
      this.current!.info.inputs++;
      this.current!.info.to = at;
      return null;
    }
    const cycle = copyCycle(history);
    if (cycle === null) throw new HistoryError(`Input ${seq} starts the history with a change and no copy`);
    const done = this.current;
    this.current = { info: { cycle, firstInput: seq, inputs: 1, from: at, to: at }, entries: [entry] };
    return done;
  }

  finish(): ReplayChunk | null {
    const done = this.current;
    this.current = null;
    return done;
  }
}

/** The whole record's chunks at once (tests, and anything that already holds the record). */
export function chunkHistory(record: readonly Pick<RecordedInput, "at" | "history">[]): ReplayChunk[] {
  const builder = new ChunkBuilder();
  const chunks: ReplayChunk[] = [];
  record.forEach((r, seq) => {
    const done = builder.add(seq, r);
    if (done) chunks.push(done);
  });
  const last = builder.finish();
  if (last) chunks.push(last);
  return chunks;
}

/** The index for a game's chunks. Seats are listed in seat order. */
export function replayIndex(
  meta: { roomId: string; rulesVersion: string; endedAt: number; starts: Record<PlayerId, SeatStart> },
  chunks: readonly ChunkInfo[],
): ReplayIndex {
  const seats = Object.entries(meta.starts)
    .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
    .map(([seat, { role, character }]) => ({ seat, role, character }));
  return { v: HISTORY_VERSION, roomId: meta.roomId, rulesVersion: meta.rulesVersion, endedAt: meta.endedAt, seats, chunks: [...chunks] };
}

/** Where a game's copy lives in the bucket. Keys depend only on the game, so writing it again replaces it exactly. */
export const replayKeys = {
  prefix: (roomId: string) => `replays/${roomId}/v${HISTORY_VERSION}/`,
  chunk: (roomId: string, n: number) => `${replayKeys.prefix(roomId)}chunk-${String(n).padStart(6, "0")}.json.gz`,
  index: (roomId: string) => `${replayKeys.prefix(roomId)}index.json`,
};
