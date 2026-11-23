// Activity overload (owner, 2026-11-22, #241; eMush's `DifficultyService`): what the hunter and incident points gained
// at a cycle change are multiplied by, then rounded. The crew's AP spent since the day began (`GameState.apSpentToday`,
// never sent) is weighed against `config.difficulty.apPerSeat` × the ship's seats: at or under it, the share of seats
// held by the living (a small or thinned crew draws fewer); over it, spent ÷ threshold (a busy crew draws more).
// Unlike eMush, the dead don't count toward the share.

import type { GameState } from "./types.ts";

/** The ship's seats: `config.preselection.seats`, or everyone aboard when there was no pre-selection (single player, tests). */
function seatsOf(state: Readonly<GameState>): number {
  return state.config.preselection?.seats ?? state.players.length;
}

/** The multiplier on this cycle change's hunter and incident points; 0 with no seats. */
export function activityOverload(state: Readonly<GameState>): number {
  const seats = seatsOf(state);
  if (seats <= 0) return 0;
  const threshold = state.config.difficulty.apPerSeat * seats;
  if (state.apSpentToday > threshold) return state.apSpentToday / threshold;
  return state.players.filter((p) => p.alive).length / seats;
}

/** `points` scaled by the activity overload, rounded. */
export const scaleByActivity = (points: number, state: Readonly<GameState>): number => Math.round(points * activityOverload(state));
