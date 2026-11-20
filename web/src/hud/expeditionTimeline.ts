// The expedition screen's columns (docs/plans/expedition-ui.md, "The expedition screen"), oldest first: each resolved
// step of the report, then, while the crew is still out, the next step, the steps still to come, and Return. Pure: it
// only arranges what the view already holds (ExpeditionTimeline.tsx draws it).

import type { ExpeditionEvent, PlanetTag } from "@mush2/shared";

/** A special step's badge: the sector can come up again, someone got lost, or the crew turned back. */
export type StepBadge = "again" | "lost" | "uTurn" | "back";

export type TimelineColumn =
  /** A resolved step: `step` is its index in the report's events. */
  | { kind: "step"; step: number; event: ExpeditionEvent; badge: StepBadge | null }
  /** The next step: its tag only for a U-turn or Traitor holder (`expedition.next`), and when it resolves if known. */
  | { kind: "next"; tag: PlanetTag | null; at: number | null }
  /** A step still to come after the next. */
  | { kind: "later" }
  /** The crew back aboard the Daedalus. */
  | { kind: "return"; at: number };

/** Events after which no step comes: the crew turned back, or nobody is left to explore. */
const ENDS: ReadonlySet<ExpeditionEvent["kind"]> = new Set(["back", "uTurn", "killAll", "grounded"]);

const BADGES: Partial<Record<ExpeditionEvent["kind"], StepBadge>> = { again: "again", lost: "lost", uTurn: "uTurn", back: "back" };

export interface TimelineInput {
  /** The report's events as your view holds them (a lost member's stop where they got lost). */
  events: readonly ExpeditionEvent[];
  /** You are lost on the planet: the timeline is yours alone and stops at the line where you got lost. */
  lost: boolean;
  returnAt: number;
  next?: PlanetTag | undefined;
  nextAt?: number | undefined;
  /** Steps left, the next included (`expedition.steps`); unknown (a lost member's timeline) is drawn as one. */
  steps?: number | undefined;
}

export function timelineColumns({ events, lost, returnAt, next, nextAt, steps }: TimelineInput): TimelineColumn[] {
  const columns: TimelineColumn[] = events.map((event, step) => ({ kind: "step", step, event, badge: BADGES[event.kind] ?? null }));
  if (lost) return columns;
  const last = events.at(-1);
  const ended = steps === 0 || (last !== undefined && ENDS.has(last.kind));
  if (!ended) {
    columns.push({ kind: "next", tag: next ?? null, at: nextAt ?? null });
    for (let i = 1; i < (steps ?? 1); i++) columns.push({ kind: "later" });
  }
  columns.push({ kind: "return", at: returnAt });
  return columns;
}

/** Where the view opens: the latest resolved step, or the next step before any has resolved. */
export function latestColumn(columns: readonly TimelineColumn[]): number {
  let latest = 0;
  columns.forEach((c, i) => {
    if (c.kind === "step") latest = i;
  });
  return latest;
}
