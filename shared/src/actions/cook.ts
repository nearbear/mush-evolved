import { Action } from "./action.ts";
import { ITEM_TYPES, canReach } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type CookActionData = { type: "cook"; item: string };

/**
 * Cook (confirmed 2026-10-16): 1 AP, in a `cookRooms` room (the refectory), on an uncooked item you can reach
 * (carried or on the floor). The item becomes its cooked type in place, in the same container. Public room log.
 */
export class CookAction extends Action<CookActionData> {
  constructor() {
    super("cook");
    this.baseAPCost = 1;
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): CookActionData[] {
    if (!state.config.cook.rooms.includes(player.room)) return [];
    return state.items.filter((item) => ITEM_TYPES[item.type]?.cook && canReach(state, player, item.at)).map((item) => ({ type: "cook", item: item.id }));
  }

  override check(state: Readonly<GameState>, player: Readonly<PlayerState>, target: CookActionData): string | null {
    if (!state.config.cook.rooms.includes(player.room)) return "cant_cook";
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (!ITEM_TYPES[item.type]?.cook || !canReach(state, player, item.at)) return "cant_cook";
    return this.canAfford(state, player, target);
  }

  override apply(state: GameState, player: PlayerState, target: CookActionData): void {
    const item = state.items.find((i) => i.id === target.item)!;
    item.type = ITEM_TYPES[item.type]!.cook!.into;
    logPublic(state, player.room, "cooked", { name: player.name, item: item.type });
  }
}
