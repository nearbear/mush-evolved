import { Action, type ActionCost, isString } from "./action.ts";
import { FREEZER_ITEM, ITEM_TYPES, canReachItem, isWorking } from "../items.ts";
import { logPublic } from "../log.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type HyperfreezeActionData = { type: "hyperfreeze"; item: string };

/** A perishable ration/steak the player can reach (carried or on the floor) that can be hyperfrozen. */
const hyperfreezable = (state: Readonly<GameState>, player: Readonly<PlayerState>, item: Readonly<ItemState>): boolean =>
  !!ITEM_TYPES[item.type]?.hyperfreeze && canReachItem(state, player, item);

/** The first working freezer the player can reach (carried or on the floor). */
const workingFreezer = (state: Readonly<GameState>, player: Readonly<PlayerState>): ItemState | undefined =>
  state.items.find((i) => i.type === FREEZER_ITEM && isWorking(i) && canReachItem(state, player, i));

/**
 * Hyperfreeze (owner, 2026-11-18): 1 AP (or 0 AP + 1 Cook point), anywhere you can reach a working freezer,
 * on a `cooked_ration` or `alien_steak` you can reach. Turns it into `uncooked_ration` in place, clears
 * Fungal Cuisine spores, and keeps any existing spoilage stage (which stops advancing). Public room log.
 */
export class HyperfreezeAction extends Action<HyperfreezeActionData> {
  constructor() {
    super("hyperfreeze", { item: isString });
  }

  /** A Cook point (`resources.cook`) makes one use free, like Cook. */
  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    return player.resources.cook > 0 ? { ap: 0, mp: 0, paidBy: "cook" } : { ap: state.config.hyperfreeze.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): HyperfreezeActionData[] {
    if (!workingFreezer(state, player)) return [];
    return state.items.filter((item) => hyperfreezable(state, player, item)).map((item) => ({ type: "hyperfreeze", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: HyperfreezeActionData): string | null {
    if (!workingFreezer(state, player)) return "no_freezer";
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    if (!hyperfreezable(state, player, item)) return "cant_hyperfreeze";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: HyperfreezeActionData): void {
    const item = state.items.find((i) => i.id === target.item)!;
    const from = item.type;
    item.type = ITEM_TYPES[item.type]!.hyperfreeze!.into;
    delete item.spores;
    logPublic(state, player.room, "hyperfrozen", { name: player.character, item: from });
  }
}
