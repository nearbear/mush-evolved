import { Action, isString } from "./action.ts";
import { ITEM_TYPES, canReachItem } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type CookActionData = { type: "cook"; item: string };

/** An uncooked item the player can reach (carried or on the floor), for Cook and Express cook. */
export const cookable = (state: Readonly<GameState>, player: Readonly<PlayerState>, item: Readonly<ItemState>): boolean =>
  !!ITEM_TYPES[item.type]?.cook && canReachItem(state, player, item);

/** A `cook.rooms` room whose kitchen, if it has one, isn't broken (breakage.ts). */
const cookRoom = (state: Readonly<GameState>, player: Readonly<PlayerState>): boolean =>
  state.config.cook.rooms.includes(player.room) && !(state.equipment[player.room] ?? []).some((e) => e.type === "KITCHEN" && e.broken);

/** Turns the item into its cooked type in place. Any transformation destroys the spores (Fungal cuisine). */
export function cookItem(item: ItemState): void {
  item.type = ITEM_TYPES[item.type]!.cook!.into;
  delete item.spores;
}

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
    if (!cookRoom(state, player)) return [];
    return state.items.filter((item) => cookable(state, player, item)).map((item) => ({ type: "cook", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: CookActionData): string | null {
    if (!cookRoom(state, player)) return "cant_cook";
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (!cookable(state, player, item)) return "cant_cook";
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
    cookItem(item);
    logPublic(state, player.room, "cooked", { name: player.character, item: item.type });
  }
}
