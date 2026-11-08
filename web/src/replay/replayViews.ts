// The view of the frame on screen (#369): a seat's own (`perspective`) or all-seeing (`revealFor`), computed only for
// the step shown, never for every input the scrubber crosses. Pure, so it is tested without React.
//
// All-seeing needs every log line and message seen so far (the streams, shared/src/replayView.ts): the full view drops
// old ones (the room log trim, sealed chat pages). They are gathered from the loaded chunks only: the run of loaded
// chunks that ends at the step's, so with the cache (2 chunks each side) a step sees at least 2 cycles back. Older lines
// need older chunks, which load when the reader pages back to them (story 5).

import {
  type ChatMessage,
  type FullView,
  HistoryError,
  type LogEntry,
  mergeStreams,
  normalizeChatMessage,
  normalizeLogEntry,
  type PlayerId,
  perspective,
  readFrame,
  type Reveal,
  revealFor,
  type SeatView,
  type Streams,
} from "@mush2/shared";
import type { LoadedChunk, Step } from "./replayState.ts";

const EMPTY: Streams = { log: [], chat: [] };

/** Each frame's streams within its chunk, from the chunk's first copy: built as far as asked, kept with the chunk. */
const prefixes = new WeakMap<LoadedChunk, Streams[]>();

/** The streams of chunk `chunk` up to frame `i` (-1: its launch `base` only). */
function chunkStreams(chunk: LoadedChunk, i: number): Streams {
  const first = chunk.frames[0]?.base;
  const start = first ? mergeStreams(EMPTY, first) : EMPTY;
  if (i < 0) return start;
  let list = prefixes.get(chunk);
  if (!list) prefixes.set(chunk, (list = []));
  for (let k = list.length; k <= i && k < chunk.frames.length; k++) {
    const frame = chunk.frames[k]!;
    let acc = k === 0 ? start : list[k - 1]!;
    // A room restart's `base` mid-chunk: the state it loaded, before the input.
    if (k > 0 && frame.base) acc = mergeStreams(acc, frame.base);
    list.push(mergeStreams(acc, frame.view));
  }
  return list[Math.min(i, list.length - 1)] ?? start;
}

/** Every line and message the loaded chunks hold up to `step`, from the first loaded chunk of the run ending at it. */
export function streamsAt(chunks: Readonly<Record<number, LoadedChunk>>, firstInputs: readonly number[], step: Step): Streams {
  let from = step.chunk;
  while (from > 0 && chunks[from - 1]) from--;
  let acc = EMPTY;
  for (let n = from; n < step.chunk; n++) {
    const chunk = chunks[n]!;
    acc = mergeStreams(acc, chunkStreams(chunk, chunk.frames.length - 1));
  }
  const own = chunks[step.chunk];
  if (!own) return acc;
  return mergeStreams(acc, chunkStreams(own, step.seq - firstInputs[step.chunk]!));
}

/** Entries read once each, so the same entry keeps its identity from step to step (memoized rows skip). */
const readLog = new WeakMap<LogEntry, LogEntry>();
const readChat = new WeakMap<ChatMessage, ChatMessage>();

function readEntry<T extends object>(cache: WeakMap<T, T>, raw: T, normalize: (raw: T) => T): T {
  let read = cache.get(raw);
  if (!read) {
    try {
      read = normalize(raw);
    } catch (e) {
      throw new HistoryError(`Entry cannot be read by this build: ${e instanceof Error ? e.message : String(e)}`);
    }
    cache.set(raw, read);
  }
  return read;
}

/** Streams as recorded, in this build's shape (like `readFrame` for a frame). */
function readStreams(streams: Streams): Streams {
  return {
    log: streams.log.map((e) => readEntry(readLog, e, normalizeLogEntry)),
    chat: streams.chat.map((m) => readEntry(readChat, m, normalizeChatMessage)),
  };
}

/** What the replay shows at a step: the view, and in all-seeing what a view has no field for. */
export interface StepView {
  view: SeatView;
  reveal: Reveal | null;
}

/**
 * The view of `step` for `seat`: all-seeing (`revealFor` with the loaded streams) or the seat's own (`perspective`).
 * Throws `HistoryError` for a frame this build can't read (the page shows the summary instead).
 */
export function stepView(
  step: Step,
  seat: PlayerId,
  allSeeing: boolean,
  chunks: Readonly<Record<number, LoadedChunk>>,
  firstInputs: readonly number[],
): StepView {
  const full: FullView = readFrame(step);
  if (!allSeeing) return { view: perspective(full, seat), reveal: null };
  return revealFor(full, seat, readStreams(streamsAt(chunks, firstInputs, step)));
}

/**
 * Whether this build reads a chunk at all: its first frame through `readFrame` and `perspective`, run on the first
 * chunk loaded so an unreadable game is caught at load rather than mid-playback.
 */
export function readableChunk(chunk: LoadedChunk, seat: PlayerId): boolean {
  const first = chunk.frames[0];
  if (!first) return true;
  try {
    perspective(readFrame({ view: first.base ?? first.view, build: first.build }), seat);
    return true;
  } catch (e) {
    if (e instanceof HistoryError) return false;
    throw e;
  }
}
