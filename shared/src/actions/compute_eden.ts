import { Action, type ActionCost, DIRTY, isString } from "./action.ts";
import { edenFragmentsIn, superCalcsHere } from "../eden.ts";
import { logPrivate, logPublic } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ComputeEdenActionData = { type: "compute_eden"; equipment: string };

/** The `validate` code for Compute with too few star map fragments on the floor: shown disabled with the reason (`unaffordableActions`). */
export const FEW_FRAGMENTS = "few_fragments";

/**
 * Compute Eden's coordinates at the Super Calculator (#478; owner, 2026-11-22, eMush's numbers): 2 AP or 1 Computer
 * point, 33% per try, raised by the usual failure streak (owner, 2026-11-22). The actor must be clean, and at least 3
 * star map fragments must lie unhidden on the room's floor; carried ones don't count, and none are used up. Offered
 * until Eden is computed, disabled while fragments are short. As in eMush, success is logged in the room and a failure
 * only to the actor.
 */
export class ComputeEdenAction extends Action<ComputeEdenActionData> {
  override terminal = true;

  constructor() {
    super("compute_eden", { equipment: isString });
  }

  /** A Computer point (`resources.comp`) pays for one try instead of AP, as for planet analysis. */
  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    if (player.resources.comp > 0) return { ap: 0, mp: 0, paidBy: "comp" };
    return { ap: state.config.eden.compute.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ComputeEdenActionData[] {
    if (state.eden.computed) return [];
    return superCalcsHere(state, player).map((calc): ComputeEdenActionData => ({ type: "compute_eden", equipment: calc.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ComputeEdenActionData): string | null {
    if (!superCalcsHere(state, player).some((calc) => calc.id === target.equipment)) return "cant_compute_eden";
    if (state.eden.computed) return "eden_computed";
    if (edenFragmentsIn(state, player.room) < state.config.eden.compute.fragments) return FEW_FRAGMENTS;
    if (player.statuses.includes("dirty")) return DIRTY;
    return null;
  }

  override getSuccessChance(state: Readonly<GameState>): number {
    return state.config.eden.compute.successChance;
  }

  override apply(state: GameState, player: PlayerState): void {
    state.eden.computed = true;
    logPublic(state, player.room, "edenComputed", { name: player.character });
  }

  override fail(state: GameState, player: PlayerState): void {
    logPrivate(state, player.id, "edenComputeFailed");
  }
}
