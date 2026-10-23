import { Action } from "./action.ts";
import { isBotanistRole, isPlanted, paidWithGardenPoint } from "../botany.ts";
import { canReach } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type TreatActionData = { type: "treat"; item: string };

/**
 * Treat a plant (owner, 2026-10-22): 2 AP, or a garden point in the garden; it is no longer sick. Sickness is hidden,
 * so the Botanist role (who sees it) is offered only sick plants, and everyone else every plant: on a healthy one it
 * does nothing, with the same price, outcome and log line. Nothing here may depend on sickness for anyone else.
 */
export class TreatAction extends Action<TreatActionData> {
  constructor() {
    super("treat");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): TreatActionData[] {
    return state.items.filter((item) => treatable(state, player, item)).map((item) => ({ type: "treat", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: TreatActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    return treatable(state, player, item) ? null : "cant_treat";
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: TreatActionData): { ap: number; mp: number } {
    const pot = state.items.find((i) => i.id === target.item);
    return { ap: paidWithGardenPoint(state, player, pot) ? 0 : state.config.botany.treat.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.botany.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: TreatActionData): void {
    const pot = state.items.find((i) => i.id === target.item)!;
    if (paidWithGardenPoint(state, player, pot)) player.resources.garden -= 1;
    if (isPlanted(pot)) pot.plant.sick = false;
    logPublic(state, player.room, "treatedPlant", { name: player.character, item: pot.plant!.species });
  }
}

/** A planted pot you can reach; for the Botanist role, only a sick one. */
function treatable(state: Readonly<GameState>, player: Readonly<PlayerState>, item: Readonly<ItemState>): boolean {
  return isPlanted(item) && canReach(state, player, item.at) && (!isBotanistRole(player) || item.plant.sick);
}
