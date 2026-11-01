import { Action, isString, type ActionVisibility } from "./action.ts";
import { equipmentHere } from "../equipment.ts";
import { logPrivate } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type CheckSporesActionData = { type: "check_spores"; equipment: string };

/** Equipment type the MYCOSCAN research adds to the lab (research.ts `completeResearch`). */
export const MYCOSCAN_EQUIPMENT = "MYCOSCAN";

/**
 * Check your spore level on the MycoScan (owner, 2026-11-01; eMushpedia "Création du Mycoscan", "Vérifier"):
 * `checkSpores.cost.ap` (0) AP, once a day per character (`PlayerState.mycoscannedToday`, cleared at day start; it
 * stays with the body in a Transfer), at a working MycoScan in your room. Private: only you learn your contamination
 * level; a Mush always reads 0. Offered in pre-selection too, where everyone reads 0.
 */
export class CheckSporesAction extends Action<CheckSporesActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("check_spores", { equipment: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): CheckSporesActionData[] {
    if (player.mycoscannedToday) return [];
    return equipmentHere(state, player, MYCOSCAN_EQUIPMENT).map((scanner) => ({ type: "check_spores", equipment: scanner.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: CheckSporesActionData): string | null {
    if (!equipmentHere(state, player, MYCOSCAN_EQUIPMENT).some((scanner) => scanner.id === target.equipment)) return "cant_check_spores";
    return player.mycoscannedToday ? "daily_cap" : null;
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.checkSpores.cost.ap, mp: 0 };
  }

  override apply(state: GameState, player: PlayerState): void {
    player.mycoscannedToday = true;
    const level = player.role === "human" ? (state.contamination[player.id] ?? 0) : 0;
    logPrivate(state, player.id, "sporesChecked", { level });
  }
}
