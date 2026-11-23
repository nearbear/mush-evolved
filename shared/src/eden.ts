// Eden, first version (#478; owner, 2026-11-22, eMush's route and numbers): with the Super Calculator built, Compute at it
// (actions/compute_eden.ts) with at least 3 star map fragments on the Nexus floor. Once Eden is computed, Travel to Eden at
// the Command terminal (actions/travel_to_eden.ts), with PILGRED repaired, ends the game as a human win even with Mush
// alive (differs from eMush). No star map tree or False Eden yet; `EdenState` is an object so they can extend it.

import { SUPER_CALC_EQUIPMENT } from "./equipment.ts";
import { isPilgredRepaired } from "./pilgred.ts";
import { allLaunchKeysIn, hasTitleAccess } from "./titles.ts";
import type { GameState, PlayerState } from "./types.ts";

export interface EdenState {
  /** Whether Eden's coordinates are computed: public, as Compute's success is logged in the room and the Command terminal shows it. */
  computed: boolean;
}

/** Super Calculators in the player's room. */
export function superCalcsHere(state: Readonly<GameState>, player: Readonly<PlayerState>) {
  return (state.equipment[player.room] ?? []).filter((equipment) => equipment.type === SUPER_CALC_EQUIPMENT);
}

/**
 * Star map fragments that count toward Compute in this room: on its floor and hidden by nobody (eMush's unhidden
 * shelf), so carried fragments and ones the actor hid don't count.
 */
export function edenFragmentsIn(state: Readonly<GameState>, room: string): number {
  const fragment = state.config.eden.compute.fragmentItem;
  return state.items.filter((i) => i.at.kind === "room" && i.at.id === room && i.type === fragment && i.hiddenBy === undefined).length;
}

/**
 * Whether this player may send the ship to Eden, wherever they stand: Eden is computed, PILGRED is repaired, and they
 * have the Commander's access (the title, a hacked Command terminal), and all three launch keys are in (#480), the
 * same as Return to Sol.
 */
export function canTravelToEden(state: Readonly<GameState>, player: Readonly<PlayerState>): boolean {
  return state.launched === null && state.eden.computed && isPilgredRepaired(state) && allLaunchKeysIn(state) && hasTitleAccess(state, player, "commander");
}
