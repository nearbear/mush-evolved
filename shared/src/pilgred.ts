// PILGRED, the Daedalus's faster-than-light reactor, broken at the start; repairing it is the way home (decided 2026-10-21,
// plan in docs/scratchpad/archive/pilgred-plan.md). Progress is state (`GameState.pilgred`), seen only by the living in a room
// with the PILGRED terminal. Once it is repaired, the Commander can return to Sol (actions/return_to_sol.ts).

import { hasTitleAccess } from "./titles.ts";
import type { GameState, PlayerState } from "./types.ts";

export const PILGRED_COMPLETE = 100;

/** Skills that speed up a repair, each by `config.pilgred.progress.skillBoost` (the original's PILGRED_TAGS). */
export const PILGRED_SKILLS = ["engineer", "physicist"] as const;

export function isPilgredRepaired(state: Readonly<Pick<GameState, "pilgred">>): boolean {
  return state.pilgred.progress >= PILGRED_COMPLETE;
}

/** PILGRED terminals in the player's room. */
export function pilgredTerminalsHere(state: Readonly<GameState>, player: Readonly<PlayerState>) {
  return (state.equipment[player.room] ?? []).filter((equipment) => equipment.type === "PILGRED");
}

/** Command terminals (`PILOT_MODULE`) in the player's room, where the ship can be sent home. */
export function commandTerminalsHere(state: Readonly<GameState>, player: Readonly<PlayerState>) {
  return (state.equipment[player.room] ?? []).filter((equipment) => equipment.type === "PILOT_MODULE");
}

/**
 * Whether this player may send the ship to Sol, wherever they stand: PILGRED is repaired and they hold the Commander
 * title, Mush included (owner, 2026-10-21). Nobody while the title is vacant; the hacker kit (not built) is to add its
 * route here, through `hasTitleAccess`.
 */
export function canReturnToSol(state: Readonly<GameState>, player: Readonly<PlayerState>): boolean {
  return isPilgredRepaired(state) && hasTitleAccess(state, player, "commander");
}
