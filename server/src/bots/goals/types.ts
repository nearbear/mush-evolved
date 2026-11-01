// The shapes of bot goals (docs/plans/bot-goals.md). A goal is something a bot follows through over several turns (walk
// to a bed and rest, walk to the lab and research) instead of choosing one action at a time. Goals are pure: the bot's
// own view and memory in, one step out, so they are tested without a server or a model.

import type { Action, PlayerView, RoomId } from "@mush2/shared";

export type GoalStep =
  | { kind: "act"; action: Action }
  /** Nothing to do until the next change: the bot ends its cycle when End cycle is on, otherwise waits. */
  | { kind: "wait" }
  /** Finished. `again`: it may be chosen again this cycle (a work goal stopped only because the bot got dirty). */
  | { kind: "done"; again?: true }
  | { kind: "failed"; reason: string };

/**
 * What a bot remembers, all of it in the bot object's memory: never in game state, the record, storage or a view, and
 * lost on a restart (the bot just chooses again). Only what the bot saw itself.
 */
export interface BotMemory {
  /** AP kept for emergencies: work goals stop rather than spend it (`BOT_AP_RESERVE`). */
  readonly reserve: number;
  /** Keys of the goals that finished or failed this cycle; they aren't offered again until the next one. */
  readonly ended: Set<string>;
  /** Rooms the bot has stood in this cycle. */
  readonly visited: Set<RoomId>;
  /** A seeded roll in [0, n), for choices with no better reason (the bot's own RNG, never `Math.random`). */
  roll(n: number): number;
}

export interface Goal {
  id: string;
  /** The id plus its parameters, e.g. "rest:BEDROOM_A": what "ended this cycle" remembers. */
  key: string;
  /** One action toward the goal, or what happened. Reads only the bot's own view and the goal's own progress. */
  step(view: PlayerView, memory: BotMemory): GoalStep;
}

export interface GoalDef {
  id: string;
  /**
   * Higher goes first for a bot without a key; ties break with the bot's RNG. A plain number: when a goal applies is
   * decided by `options`, so its rank doesn't need the view.
   */
  priority: number;
  /** The forms of this goal open to the bot now, at most one or two. Empty when it doesn't apply. */
  options(view: PlayerView, memory: BotMemory): Goal[];
}
