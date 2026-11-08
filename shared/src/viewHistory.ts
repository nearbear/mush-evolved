// The replay history (#335, docs/rules/rules-design.md "Replay history and storage"): every input's record entry
// carries the input's change to the full view (fullView.ts), so a replay reads the views the game had instead of
// running old rules again. The server writes it in the same storage write as the input, so it costs no extra row and
// can't disagree with the record.
//
// Full copies, each with the format version: at each cycle (so a replay can jump by cycle), and with the first input
// after every room start, as the view the room loaded (a deploy can change the view's shape, or the config, mid-game).
// Each copy carries the build that recorded it (`BuildStamp`, #384), and a frame is brought to this build's shape
// (`readFrame`) only when it is shown.

import type { FullView } from "./fullView.ts";
import { MIN_STATE_VERSION, normalizeFrame } from "./normalizeState.ts";
import { applyDiff, diffView, type ViewDiff } from "./viewDiff.ts";

/**
 * The history container's format: `HistoryStep` and `ViewDiff` only (never bumped for `FullView` / `GameState` field
 * changes, which `perspective` and the viewer handle). Old games keep the old number in their index and steps.
 */
export const HISTORY_VERSION = 1;

/**
 * The build that recorded a copy of the view (#384): its stored-state version (`STATE_VERSION`), which decides the
 * upgrade steps the copy needs (`readFrame`), and its `RULES_VERSION` (the commit hash on a deploy), for display only:
 * the replay's "recorded on an older build" badge. Every step that carries a copy has one; the diffs after it share it.
 */
export interface BuildStamp {
  stateVersion: number;
  rulesVersion: string;
}

/** One input's part of the history, stored in its record entry (`RecordedInput.history`). */
export type HistoryStep =
  /** A full copy of the view after the input: every `cycle` input. `build` is missing on copies recorded before #384. */
  | { v: number; full: FullView; build?: BuildStamp }
  /** The first input since the room started: the view as the room loaded it, then the input's change to it. */
  | { v: number; base: FullView; diff?: ViewDiff; build?: BuildStamp }
  /** The input's change to the view after the input before it (missing when it changed nothing). */
  | { diff?: ViewDiff };

/**
 * The step for an input. `prev` is the view after the last input this room recorded since it started, or null for
 * the first one, when `loaded` (the view before the input, as the room has it) becomes the copy it starts from.
 * `build` is the room's own, stamped on a step that carries a copy.
 */
export function historyStep(prev: FullView | null, loaded: () => FullView, next: FullView, cycle: boolean, build: BuildStamp): HistoryStep {
  if (cycle) return { v: HISTORY_VERSION, full: next, build };
  const base = prev ?? loaded();
  const diff = diffView(base, next);
  const change = diff !== undefined && { diff };
  return prev === null ? { v: HISTORY_VERSION, base, ...change, build } : { ...change };
}

/** Thrown for a history this code can't read: another format version, a change with nothing before it, or an older `FullView` shape `perspective` can't run `viewFor` on. */
export class HistoryError extends Error {}

/**
 * One input's views: the copy it started from, if it carries one (`frames[0].base` is the launch state before input 0,
 * and a mid-game `base` is the state loaded on a room restart), and the view after it.
 */
export interface HistoryFrame {
  base?: FullView;
  /** As recorded, in the shape of the build that recorded it: show it through `readFrame`. */
  view: FullView;
  /** The build that recorded the copy this frame continues from; null when that copy predates stamps (#384). */
  build: BuildStamp | null;
}

/**
 * Rebuilds the full view after every step, in order. The steps must start at a full copy (the first input of a game
 * always carries one, since the room has just started). Unchanged parts are shared between frames: don't mutate them.
 */
export function rebuildHistory(steps: readonly HistoryStep[]): HistoryFrame[] {
  const frames: HistoryFrame[] = [];
  let view: FullView | null = null;
  let build: BuildStamp | null = null;
  for (const [i, step] of steps.entries()) {
    if ("v" in step && step.v !== HISTORY_VERSION) throw new HistoryError(`History step ${i} is format ${step.v}, not ${HISTORY_VERSION}`);
    if ("full" in step) {
      view = step.full;
      build = step.build ?? null;
      frames.push({ view, build });
      continue;
    }
    const base: FullView | null = "base" in step ? step.base : view;
    if (base === null) throw new HistoryError(`History step ${i} is a change with nothing before it`);
    if ("base" in step) build = step.build ?? null;
    view = applyDiff(base, step.diff) as FullView;
    frames.push({ ...("base" in step && { base }), view, build });
  }
  return frames;
}

/** Frames already read, by their recorded view, so stepping back and forth reads each one once. */
const readFrames = new WeakMap<FullView, FullView>();

/**
 * A frame's view in this build's shape (#384): the upgrade steps it still needs, then `normalizeFullView`. This is
 * what `perspective` and `revealFor` take. Run it only for the step on screen, after `rebuildHistory`: never on a
 * `base` before its diffs are applied, since the diffs were recorded against the view as stored. A frame with no stamp
 * is read as `MIN_STATE_VERSION`. Anything this build can't read (too new, or a shape the normalizers reject) throws
 * `HistoryError`, so the viewer shows its "too old to read" summary. Memoized; the result is shared, don't mutate it.
 */
export function readFrame(frame: Pick<HistoryFrame, "view" | "build">): FullView {
  const known = readFrames.get(frame.view);
  if (known) return known;
  let read: FullView;
  try {
    read = normalizeFrame(frame.view, frame.build?.stateVersion ?? MIN_STATE_VERSION);
  } catch (e) {
    throw new HistoryError(`Frame cannot be read by this build: ${e instanceof Error ? e.message : String(e)}`);
  }
  readFrames.set(frame.view, read);
  return read;
}
