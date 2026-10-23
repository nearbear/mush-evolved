import { Action } from "./action.ts";
import { isPlanted, paidWithGardenPoint } from "../botany.ts";
import { canReach } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type WaterActionData = { type: "water"; item: string };

/**
 * Water a plant (owner, 2026-10-22): 1 AP, or a garden point in the garden, on one thirsty or dried plant you can
 * reach. It is healthy again. Thirst is public, so refusing a plant that isn't thirsty leaks nothing. Public room log.
 */
export class WaterAction extends Action<WaterActionData> {
  constructor() {
    super("water");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): WaterActionData[] {
    return state.items.filter((item) => thirstyHere(state, player, item)).map((item) => ({ type: "water", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: WaterActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    return thirstyHere(state, player, item) ? null : "cant_water";
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: WaterActionData): { ap: number; mp: number } {
    const pot = state.items.find((i) => i.id === target.item);
    return { ap: paidWithGardenPoint(state, player, pot) ? 0 : state.config.botany.water.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.botany.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: WaterActionData): void {
    const pot = state.items.find((i) => i.id === target.item)!;
    if (paidWithGardenPoint(state, player, pot)) player.resources.garden -= 1;
    if (isPlanted(pot)) pot.plant.thirst = 0;
    logPublic(state, player.room, "wateredPlant", { name: player.character, item: pot.plant!.species });
  }
}

function thirstyHere(state: Readonly<GameState>, player: Readonly<PlayerState>, item: Readonly<ItemState>): boolean {
  return isPlanted(item) && item.plant.thirst > 0 && canReach(state, player, item.at);
}
