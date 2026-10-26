import { Action, isString } from "./action.ts";
import { ITEM_TYPES, canReachItem } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type CookActionData = { type: "cook"; item: string };

/**
 * Cook (confirmed 2026-10-16): 1 AP, in a `cookRooms` room (the refectory), on an uncooked item you can reach
 * (carried or on the floor). The item becomes its cooked type in place, in the same container. Public room log.
 */
export class CookAction extends Action<CookActionData> {
  constructor() {
    super("cook", { item: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.cook.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): CookActionData[] {
    if (!state.config.cook.rooms.includes(player.room)) return [];
    return state.items.filter((item) => ITEM_TYPES[item.type]?.cook && canReachItem(state, player, item)).map((item) => ({ type: "cook", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: CookActionData): string | null {
    if (!state.config.cook.rooms.includes(player.room)) return "cant_cook";
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (!ITEM_TYPES[item.type]?.cook || !canReachItem(state, player, item)) return "cant_cook";
    return null;
  }

  override dirtChance(state: Readonly<GameState>): number {
    return state.config.cook.dirtyChance;
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.cook.injuryChance;
  }

  override apply(state: GameState, player: PlayerState, target: CookActionData): void {
    const item = state.items.find((i) => i.id === target.item)!;
    item.type = ITEM_TYPES[item.type]!.cook!.into;
    delete item.spores; // any transformation destroys the spores (Fungal cuisine)
    logPublic(state, player.room, "cooked", { name: player.character, item: item.type });
  }
}
