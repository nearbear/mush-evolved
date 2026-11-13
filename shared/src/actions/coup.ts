import { Action, type ActionVisibility } from "./action.ts";
import { equipmentHere } from "../equipment.ts";
import { logSecret } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type CoupActionData = { type: "coup"; equipment: string };

/**
 * The Politician's Coup (owner, 2026-11-12): in a room with a NERON core (not a terminal action: no need to open its window), `coup.cost.ap` (3) AP and `coup.dirtyChance` (50%) to get
 * dirty, any living player with the skill, Mush and the dirty included. It never fails and has no use limit, but is
 * refused for the current Commander and while your own coup is pending. It only sets `PlayerState.coupPending`;
 * `coupCycle` (coup.ts) grants the Commander title at the next cycle change. Secret, so roommates see it happen.
 */
export class CoupAction extends Action<CoupActionData> {
  override visibility: ActionVisibility = "secret";

  constructor() {
    super("coup", { equipment: (v): v is string => typeof v === "string" });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.coup.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.coup.dirtyChance;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): CoupActionData[] {
    if (!hasSkill(player, "politician") || player.coupPending || state.titles.commander === player.id) return [];
    return equipmentHere(state, player, "NERON_CORE").map((core): CoupActionData => ({ type: "coup", equipment: core.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: CoupActionData): string | null {
    if (!hasSkill(player, "politician")) return "no_skill";
    if (!equipmentHere(state, player, "NERON_CORE").some((core) => core.id === target.equipment)) return "cant_coup";
    if (state.titles.commander === player.id) return "already_commander";
    if (player.coupPending) return "coup_pending";
    return null;
  }

  override apply(state: GameState, player: PlayerState, _target: CoupActionData): void {
    player.coupPending = true;
    logSecret(state, player.id, "coup", { name: player.character });
  }
}
