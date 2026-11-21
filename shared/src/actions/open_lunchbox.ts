import { Action, type ActionCost, isString } from "./action.ts";
import { canReachItem, isWorking, LUNCHBOX_ITEM, produceItem, removeItem } from "../items.ts";
import { logPrivate } from "../log.ts";
import type { GameState, ItemState, PlayerState } from "../types.ts";

export type OpenLunchboxActionData = { type: "open_lunchbox"; item: string };

/**
 * Open a lunchbox, carried or in the room (owner, 2026-11-21, eMush's Open): `lunchbox.cost.ap` AP (0), and one
 * standard ration goes to your hands, or the floor if they are full. Each opening spends a charge; the empty box is
 * gone. Private, as in eMush.
 */
export class OpenLunchboxAction extends Action<OpenLunchboxActionData> {
  constructor() {
    super("open_lunchbox", { item: isString });
  }

  override getCost(state: Readonly<GameState>): ActionCost {
    return { ap: state.config.lunchbox.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): OpenLunchboxActionData[] {
    return state.items.filter((item) => openable(state, player, item)).map((item) => ({ type: "open_lunchbox", item: item.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: OpenLunchboxActionData): string | null {
    const item = state.items.find((i) => i.id === target.item);
    if (!item) return "no_such_item";
    return openable(state, player, item) ? null : "cant_open";
  }

  override apply(state: GameState, player: PlayerState, target: OpenLunchboxActionData): void {
    const box = state.items.find((i) => i.id === target.item)!; // checked, so it exists
    box.charges = (box.charges ?? 1) - 1;
    if (box.charges <= 0) removeItem(state, box.id);
    produceItem(state, player, "uncooked_ration");
    logPrivate(state, player.id, "lunchboxOpened");
  }
}

const openable = (state: Readonly<GameState>, player: Readonly<PlayerState>, item: Readonly<ItemState>): boolean =>
  item.type === LUNCHBOX_ITEM && isWorking(item) && (item.charges ?? 0) > 0 && canReachItem(state, player, item);
