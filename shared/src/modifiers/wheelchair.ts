import { isInactive } from "../inactivity.ts";
import { isComatose } from "../statuses.ts";
import type { Modifier } from "../modifiers.ts";
import type { GameState, PlayerState } from "../types.ts";

// Terrence's wheelchair (owner, 2026-10-19; updated 2026-11-24 to match eMush while keeping Accommodate):
// - Solo AP-to-MP conversions yield `wheelchair.conversionMpPenalty` (2) fewer MP (clamped at 0).
// - Leaving a room is free (0 MP, waiving heavy items and Broken Ribs) while at least one awake, active, non-comatose
//   living roommate has stood in the room for at least `wheelchair.helpDelayMs` (30s). Leaving for free logs a public
//   room line naming a qualifying roommate (`wheelchairHelped`, actions/move.ts).
// - Applies to a Mush Terrence too, like all other character traits.
// - Others can still offer to push him (`accommodate.ts`) if they don't want to wait 30s.

export const wheelchair: Modifier = {
  movement: (rules, _player, state) => ({
    ...rules,
    mpPerConversion: Math.max(0, rules.mpPerConversion - state.config.wheelchair.conversionMpPenalty),
  }),
};

/** Whether `other` can help a wheelchair user leave their room right now (living, awake, non-comatose, active roommate). */
const isEligibleHelper = (state: Readonly<GameState>, player: Readonly<PlayerState>, other: Readonly<PlayerState>): boolean =>
  other.id !== player.id &&
  other.alive &&
  other.room === player.room &&
  other.lyingIn === undefined &&
  !isComatose(state, other) &&
  !isInactive(other);

/** Whether `other` has stood in the room long enough (`config.wheelchair.helpDelayMs`) to help. */
const hasWaitedEnough = (state: Readonly<GameState>, other: Readonly<PlayerState>): boolean =>
  other.enteredRoomAt === undefined || state.now - other.enteredRoomAt >= state.config.wheelchair.helpDelayMs;

/**
 * Living, awake, non-comatose, active roommates who have been in the room for at least `config.wheelchair.helpDelayMs`.
 * In seat order, so picking the first for the public log is deterministic without touching `state.rng`.
 */
export function wheelchairHelpers(state: Readonly<GameState>, player: Readonly<PlayerState>): PlayerState[] {
  if (!player.modifiers.includes("wheelchair")) return [];
  return state.players.filter((o) => isEligibleHelper(state, player, o) && hasWaitedEnough(state, o));
}

/**
 * Earliest server time (ms) when a roommate will finish waiting `helpDelayMs` and unlock a free move for a wheelchair
 * user who doesn't already have one, or null when none is pending. Used by `nextDue` / `tick` (queue.ts).
 */
export function nextWheelchairHelpAt(state: Readonly<GameState>): number | null {
  if (state.phase !== "playing") return null;
  const delay = state.config.wheelchair.helpDelayMs;
  let earliest: number | null = null;
  for (const p of state.players) {
    if (!p.alive || !p.modifiers.includes("wheelchair") || p.pushedBy !== undefined) continue;
    if (wheelchairHelpers(state, p).length > 0) continue;
    for (const o of state.players) {
      if (!isEligibleHelper(state, p, o) || o.enteredRoomAt === undefined) continue;
      const readyAt = o.enteredRoomAt + delay;
      if (readyAt > state.now && (earliest === null || readyAt < earliest)) earliest = readyAt;
    }
  }
  return earliest;
}
