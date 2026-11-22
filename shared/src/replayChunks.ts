// A finished game's history as it is copied to R2 (#336, docs/rules/rules-design.md "Replay history and storage"):
// per-cycle chunks plus a small index. Here so the server that writes them and the viewer that reads them (#337) share
// the types.
//
// A chunk starts at a step that carries a full copy of the view: each `cycle` input's copy, and the launch's first
// input's `base`. So every chunk rebuilds by itself (`rebuildHistory`). A room restart mid-cycle adds a `base` step
// inside a chunk, which `rebuildHistory` already reads.
//
// Only the history leaves the room for the public replay: never the input itself, the text before moderation (`raw`),
// the record's link from an input to its message (`chatId`), accounts or blocked text. The replay is made from the full
// view alone, so nothing beyond what that view shows is copied. That view does keep each chat message's own `id`, so a
// report can cite one from the replay; ids stay out of live views only (`ChatMessage.id`).
//
// `copyReplay` also writes `moderation.json` (moderator-only `raw`, `rawByInput`, `blocked`, and `rateLimited`, #339,
// #157) before the index, under a key the public replay routes never serve, so room storage can be reclaimed 48 hours
// after archiving.

import type { PlayerId } from "./types.ts";
import type { RecordedInput } from "./replay.ts";
import type { SeatStart } from "./fullView.ts";
import { STATE_VERSION } from "./normalizeState.ts";
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
  /** `STATE_VERSION` of the build that wrote the index (#384); each frame's own is its copy's `BuildStamp`. Missing on older indexes. */
  stateVersion?: number;
  endedAt: number;
  /**
   * The game's cycles ran on a clock (multiplayer), so the replay shows the countdown to the next cycle; a
   * single-player game's cycles end by End cycle, so it has none. Missing on older indexes: no countdown.
   */
  realTime?: boolean;
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

/** What the index says about a game besides its chunks. */
export interface ReplayMeta {
  roomId: string;
  rulesVersion: string;
  endedAt: number;
  /** `ReplayIndex.realTime`. */
  realTime?: boolean;
  starts: Record<PlayerId, SeatStart>;
  /** Per seat, messages rejected by the rate limiters (#339, #157). */
  rateLimited?: Record<PlayerId, number>;
}

/** Text moderation refused (`blocked:<seq>` in room storage, copied to `moderation.json` for #157). Moderators only. */
export interface BlockedText {
  at: number;
  by: PlayerId;
  type: "chat" | "createChannel" | "createThread" | "sharePlanet" | "shareReport" | "sharePlants" | "sharePilgred";
  raw: string;
  reason: string;
}

/**
 * Moderator-only data for a finished game (`replays/<roomId>/moderation.json`, #339, #157), written before the index
 * and never served by the public replay routes. `raw` maps each filtered chat message's `ChatMessage.id` (`chatId`)
 * to the text before moderation changed it; `rawByInput` maps the record position (`input:<seq>`) to `raw` for
 * filtered inputs without a `chatId` (channel/thread names, planet/report shares).
 */
export interface ReplayModeration {
  v: number;
  roomId: string;
  raw: Record<number, string>;
  rawByInput: Record<number, string>;
  blocked: BlockedText[];
  rateLimited: Record<PlayerId, number>;
}

/** The index for a game's chunks. Seats are listed in seat order. */
export function replayIndex(
  meta: ReplayMeta,
  chunks: readonly ChunkInfo[],
): ReplayIndex {
  const seats = Object.entries(meta.starts)
    .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
    .map(([seat, { role, character }]) => ({ seat, role, character }));
  return {
    v: HISTORY_VERSION,
    roomId: meta.roomId,
    rulesVersion: meta.rulesVersion,
    stateVersion: STATE_VERSION,
    endedAt: meta.endedAt,
    ...(meta.realTime !== undefined && { realTime: meta.realTime }),
    seats,
    chunks: [...chunks],
  };
}

/** Where a game's copy lives in the bucket. Keys depend only on the game, so writing it again replaces it exactly. */
export const replayKeys = {
  prefix: (roomId: string) => `replays/${roomId}/`,
  chunk: (roomId: string, n: number) => `${replayKeys.prefix(roomId)}chunk-${String(n).padStart(6, "0")}.json.gz`,
  moderation: (roomId: string) => `${replayKeys.prefix(roomId)}moderation.json`,
  index: (roomId: string) => `${replayKeys.prefix(roomId)}index.json`,
};
