// The replay history (#335, docs/rules/rules-design.md "Replay history and storage"): every input's record entry
// carries the input's change to the full view (fullView.ts), so a replay reads the views the game had instead of
// running old rules again. The server writes it in the same storage write as the input, so it costs no extra row and
// can't disagree with the record.
//
// Full copies, each with the format version: at each cycle (so a replay can jump by cycle), and with the first input
// after every room start, as the view the room loaded (a deploy can change the view's shape, or the config, mid-game).

import type { FullView } from "./fullView.ts";
import { applyDiff, diffView, type ViewDiff } from "./viewDiff.ts";

/**
 * The history container's format: `HistoryStep` and `ViewDiff` only (never bumped for `FullView` / `GameState` field
 * changes, which `perspective` and the viewer handle). Old games keep the old number in their index and steps.
 */
export const HISTORY_VERSION = 1;

/** One input's part of the history, stored in its record entry (`RecordedInput.history`). */
export type HistoryStep =
  /** A full copy of the view after the input: every `cycle` input. */
  | { v: number; full: FullView }
  /** The first input since the room started: the view as the room loaded it, then the input's change to it. */
  | { v: number; base: FullView; diff?: ViewDiff }
  /** The input's change to the view after the input before it (missing when it changed nothing). */
  | { diff?: ViewDiff };

/**
 * The step for an input. `prev` is the view after the last input this room recorded since it started, or null for
 * the first one, when `loaded` (the view before the input, as the room has it) becomes the copy it starts from.
 */
export function historyStep(prev: FullView | null, loaded: () => FullView, next: FullView, cycle: boolean): HistoryStep {
  if (cycle) return { v: HISTORY_VERSION, full: next };
  const base = prev ?? loaded();
  const diff = diffView(base, next);
  const change = diff !== undefined && { diff };
  return prev === null ? { v: HISTORY_VERSION, base, ...change } : { ...change };
}

/** Thrown for a history this code can't read: another format version, a change with nothing before it, or an older `FullView` shape `perspective` can't run `viewFor` on. */
export class HistoryError extends Error {}

/**
 * One input's views: the copy it started from, if it carries one (`frames[0].base` is the launch state before input 0,
 * and a mid-game `base` is the state loaded on a room restart), and the view after it.
 */
export interface HistoryFrame {
  base?: FullView;
  view: FullView;
}

/**
 * Rebuilds the full view after every step, in order. The steps must start at a full copy (the first input of a game
 * always carries one, since the room has just started). Unchanged parts are shared between frames: don't mutate them.
 */
export function rebuildHistory(steps: readonly HistoryStep[]): HistoryFrame[] {
  const frames: HistoryFrame[] = [];
  let view: FullView | null = null;
  for (const [i, step] of steps.entries()) {
    if ("v" in step && step.v !== HISTORY_VERSION) throw new HistoryError(`History step ${i} is format ${step.v}, not ${HISTORY_VERSION}`);
    if ("full" in step) {
      view = step.full;
      frames.push({ view });
      continue;
    }
    const base: FullView | null = "base" in step ? step.base : view;
    if (base === null) throw new HistoryError(`History step ${i} is a change with nothing before it`);
    view = applyDiff(base, step.diff) as FullView;
    frames.push({ ...("base" in step && { base }), view });
  }
  return frames;
}
