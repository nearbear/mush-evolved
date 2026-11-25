import { Action, type ActionCost, isString } from "./action.ts";
import { isEmptyPot, isFruit, paidWithGardenPoint } from "../botany.ts";
import { canReachItem, removeItem } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type SowActionData = { type: "sow"; item: string };

/**
 * First empty hydropot in reach, preferring one on the room floor over a carried one so sowing doesn't plant into
 * your pocket when a garden pot is sitting right there.
 */
function findEmptyPot(state: Readonly<GameState>, player: Readonly<PlayerState>): ItemState | undefined {
  const pots = state.items.filter((i) => isEmptyPot(i) && canReachItem(state, player, i));
  return pots.find((i) => i.at.kind === "room") ?? pots[0];
}

/**
 * Sow (owner, 2026-10-22; updated 2026-11-14): 2 AP, or a garden point in the garden. Targets a fruit you can reach
 * (carried or on the floor) and plants it in an empty hydropot you can reach, which becomes a young plant of its
 * species (age 0, healthy). The fruit is used up. Public room log.
 */
export class SowAction extends Action<SowActionData> {
  constructor() {
    super("sow", { item: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SowActionData[] {
    if (!findEmptyPot(state, player)) return [];
    return state.items
      .filter((i) => isFruit(i) && canReachItem(state, player, i))
      .map((fruit): SowActionData => ({ type: "sow", item: fruit.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SowActionData): string | null {
    const fruit = state.items.find((i) => i.id === target.item);
    if (!fruit) return "no_such_item";
    if (!isFruit(fruit) || !canReachItem(state, player, fruit)) return "cant_sow";
    if (!findEmptyPot(state, player)) return "cant_sow";
    return null;
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    const pot = findEmptyPot(state, player);
    return paidWithGardenPoint(state, player, pot) ? { ap: 0, mp: 0, paidBy: "garden" } : { ap: state.config.botany.sow.cost.ap, mp: 0 };
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.botany.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: SowActionData): void {
    const pot = findEmptyPot(state, player)!;
    const species = removeItem(state, target.item).type;
    pot.plant = { species, age: 0, thirst: 0, sick: false };
    pot.owner = player.id;
    delete pot.customName;
    logPublic(state, player.room, "sowedPlant", { name: player.character, item: species });
  }
}
