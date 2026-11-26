import { Action, isString } from "./action.ts";
import { cookable, cookItem } from "./cook.ts";
import { MICROWAVE_ITEM } from "../itemIds.ts";
import { canReachItem, isWorking } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";
import { rubellaBlocks } from "../diseases.ts";

export type ExpressCookActionData = { type: "express_cook"; item: string };

/** The first microwave with a charge left that the player can reach (carried or on the floor). */
function chargedMicrowave(state: Readonly<GameState>, player: Readonly<PlayerState>): ItemState | undefined {
  return state.items.find((i) => i.type === MICROWAVE_ITEM && isWorking(i) && (i.charges ?? 0) > 0 && canReachItem(state, player, i));
}

/**
 * Express cook (owner, 2026-10-19): `expressCook.cost.ap` (0), in any room, with a microwave you can reach that has
 * a charge left, on an uncooked item you can reach. Spends one charge; the item becomes its cooked type in place,
 * like Cook. Public room log. Consequences for using it are planned but not decided.
 */
export class ExpressCookAction extends Action<ExpressCookActionData> {
  constructor() {
    super("express_cook", { item: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.expressCook.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ExpressCookActionData[] {
    if (!chargedMicrowave(state, player)) return [];
    return state.items.filter((item) => cookable(state, player, item)).map((item) => ({ type: "express_cook", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ExpressCookActionData): string | null {
    if (rubellaBlocks(player)) return "cant_cook";
    if (!chargedMicrowave(state, player)) return "no_microwave";
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (!cookable(state, player, item)) return "cant_cook";
    return null;
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.expressCook.dirtyChance;
  }

  override apply(state: GameState, player: PlayerState, target: ExpressCookActionData): void {
    const microwave = chargedMicrowave(state, player)!;
    microwave.charges = microwave.charges! - 1;
    const item = state.items.find((i) => i.id === target.item)!;
    cookItem(item);
    logPublic(state, player.room, "expressCooked", { name: player.character, item: item.type });
  }
}
