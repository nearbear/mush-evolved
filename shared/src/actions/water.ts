import { Action, type ActionCost, isString } from "./action.ts";
import { isPlanted, paidWithGardenPoint } from "../botany.ts";
import { canReachItem } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type WaterActionData = { type: "water"; item: string };

/**
 * Water a plant (owner, 2026-10-22): 1 AP, or a garden point in the garden, on one thirsty or dried plant you can
 * reach. It is healthy again. Thirst is public, so refusing a plant that isn't thirsty leaks nothing. Public room log.
 */
export class WaterAction extends Action<WaterActionData> {
  constructor() {
    super("water", { item: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): WaterActionData[] {
    return state.items.filter((item) => thirstyHere(state, player, item)).map((item) => ({ type: "water", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: WaterActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    return thirstyHere(state, player, item) ? null : "cant_water";
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: WaterActionData): ActionCost {
    const pot = state.items.find((i) => i.id === target.item);
    return paidWithGardenPoint(state, player, pot) ? { ap: 0, mp: 0, paidBy: "garden" } : { ap: state.config.botany.water.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.botany.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: WaterActionData): void {
    const pot = state.items.find((i) => i.id === target.item)!;
    if (isPlanted(pot)) pot.plant.thirst = 0;
    if (pot.customName) logPublic(state, player.room, "wateredNamedPlant", { name: player.character, plant: pot.customName });
    else logPublic(state, player.room, "wateredPlant", { name: player.character, item: pot.plant!.species });
  }
}

function thirstyHere(state: Readonly<GameState>, player: Readonly<PlayerState>, item: Readonly<ItemState>): boolean {
  return isPlanted(item) && item.plant.thirst > 0 && canReachItem(state, player, item);
}
