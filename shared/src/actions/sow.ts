import { Action, type ActionCost, isString } from "./action.ts";
import { isEmptyPot, isFruit, paidWithGardenPoint } from "../botany.ts";
import { canReachItem, removeItem, itemsIn } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SowActionData = { type: "sow"; item: string; fruit: string };

/**
 * Sow (owner, 2026-10-22): 2 AP, or a garden point in the garden. A fruit you carry goes into an empty hydropot you
 * can reach, which becomes a young plant of its species (age 0, healthy). The fruit is used up. Public room log.
 */
export class SowAction extends Action<SowActionData> {
  constructor() {
    super("sow", { item: isString, fruit: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SowActionData[] {
    const fruits = itemsIn(state, { kind: "player", id: player.id }).filter(isFruit);
    const pots = state.items.filter((i) => isEmptyPot(i) && canReachItem(state, player, i));
    return pots.flatMap((pot) => fruits.map((fruit): SowActionData => ({ type: "sow", item: pot.id, fruit: fruit.id })));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SowActionData): string | null {
    const pot = state.items.find((i) => i.id === target.item);
    const fruit = state.items.find((i) => i.id === target.fruit);
    if (!pot || !fruit) return "no_such_item";
    if (!isEmptyPot(pot) || !canReachItem(state, player, pot)) return "cant_sow";
    if (!isFruit(fruit) || fruit.at.kind !== "player" || fruit.at.id !== player.id) return "cant_sow";
    return null;
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SowActionData): ActionCost {
    const pot = state.items.find((i) => i.id === target.item);
    return paidWithGardenPoint(state, player, pot) ? { ap: 0, mp: 0, paidBy: "garden" } : { ap: state.config.botany.sow.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.botany.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: SowActionData): void {
    const pot = state.items.find((i) => i.id === target.item)!;
    const species = removeItem(state, target.fruit).type;
    pot.plant = { species, age: 0, thirst: 0, sick: false };
    logPublic(state, player.room, "sowedPlant", { name: player.character, item: species });
  }
}
