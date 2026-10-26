import { Action, type ActionVisibility, isString } from "./action.ts";
import { combustionLevel, equipmentHere } from "./take_fuel.ts";
import { logPrivate } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type CheckCombustionActionData = { type: "check_combustion"; equipment: string };

/**
 * Read the combustion chamber's fuel level off its access panel (owner, 2026-10-23). Free, no dirt chance, and only
 * you see the reading (a private log line).
 */
export class CheckCombustionAction extends Action<CheckCombustionActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("check_combustion", { equipment: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): CheckCombustionActionData[] {
    return equipmentHere(state, player, "COMBUSTION_CHAMBER_ACCESS").map((chamber): CheckCombustionActionData => ({ type: "check_combustion", equipment: chamber.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: CheckCombustionActionData): string | null {
    return equipmentHere(state, player, "COMBUSTION_CHAMBER_ACCESS").some((chamber) => chamber.id === target.equipment) ? null : "cant_check_combustion";
  }

  override apply(state: GameState, player: PlayerState, _target: CheckCombustionActionData): void {
    logPrivate(state, player.id, "checkedCombustion", combustionLevel(state));
  }
}
