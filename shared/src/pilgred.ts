// PILGRED, the Daedalus's faster-than-light reactor, broken at the start; repairing it is the way home (decided 2026-10-21,
// plan in docs/scratchpad/pilgred-plan.md). Progress is state (`GameState.pilgred`), seen only by the living in a room
// with the PILGRED terminal. Once it is repaired, the Commander can return to Sol (actions/return_to_sol.ts).

import { roll } from "./rng.ts";
import { hasSkill } from "./skills.ts";
import { hasTitleAccess } from "./titles.ts";
import type { GameState, PlayerState } from "./types.ts";

export const PILGRED_COMPLETE = 100;

/** Skills that speed up a repair, each by `config.pilgred.progress.skillBoost` (the original's PILGRED_TAGS). */
export const PILGRED_SKILLS = ["engineer", "physicist"] as const;

/**
 * The gain range of one repair by this player, the original's `getBaseProgress`: `rate * mod / 10` (rounded down), plus the
 * boost for each PILGRED skill, minus the relay penalty for each repair in a row this player has just made (relaying: it
 * resets once someone else repairs; the noRelayPenalty cheat waives it), never below 0. The gain is rolled in [min, min + min / 2].
 */
export function pilgredGainRange(state: Readonly<GameState>, player: Readonly<PlayerState>): { min: number; max: number } {
  const { rate, mod, skillBoost, relayPenalty } = state.config.pilgred.progress;
  const relaying = state.pilgred.lastBy === player.id && !player.cheats.includes("noRelayPenalty");
  const streak = relaying ? state.pilgred.streak : 0;
  let base = Math.floor((rate * mod) / 10);
  for (const skill of PILGRED_SKILLS) if (hasSkill(player, skill)) base += skillBoost;
  base = Math.max(0, base - streak * relayPenalty);
  return { min: base, max: base + (base >> 1) };
}

/** Rolls one repair's gain with the seeded RNG (no draw when the range is a single value). */
export function rollPilgredGain(state: GameState, range: { min: number; max: number }): number {
  return range.max === range.min ? range.min : roll(state, [range.min, range.max]);
}

export function isPilgredRepaired(state: Readonly<Pick<GameState, "pilgred">>): boolean {
  return state.pilgred.progress >= PILGRED_COMPLETE;
}

/** PILGRED terminals in the player's room. */
export function pilgredTerminalsHere(state: Readonly<GameState>, player: Readonly<PlayerState>) {
  return (state.config.equipment[player.room] ?? []).filter((equipment) => equipment.type === "PILGRED");
}

/** Command terminals (`PILOT_MODULE`) in the player's room, where the ship can be sent home. */
export function commandTerminalsHere(state: Readonly<GameState>, player: Readonly<PlayerState>) {
  return (state.config.equipment[player.room] ?? []).filter((equipment) => equipment.type === "PILOT_MODULE");
}

/**
 * Whether this player may send the ship to Sol, wherever they stand: PILGRED is repaired and they hold the Commander
 * title, Mush included (owner, 2026-10-21). Nobody while the title is vacant; the hacker kit (not built) is to add its
 * route here, through `hasTitleAccess`.
 */
export function canReturnToSol(state: Readonly<GameState>, player: Readonly<PlayerState>): boolean {
  return isPilgredRepaired(state) && hasTitleAccess(state, player, "commander");
}
