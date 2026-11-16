import { Action, type ActionCost, type ActionVisibility, isIndex, isString } from "./action.ts";
import { comTerminalsHere } from "../comms.ts";
import { logPrivate } from "../log.ts";
import { closeDeal, dealBlock } from "../merchants.ts";
import { hasTitleAccess } from "../titles.ts";
import type { GameState, PlayerState } from "../types.ts";

export type CloseDealActionData = { type: "close_deal"; equipment: string; merchant: string; deal: number };

/**
 * Close a merchant's deal at the Com center terminal (owner, 2026-11-15, #143): 2 AP, the comms officer alone. The ship
 * pays (merchants.ts, `closeDeal`), the goods appear on the Front Storage floor, and the merchant leaves. A deal the
 * ship can't pay for is refused here and shown blocked at the terminal (`comms.terminal.merchants`). Private for now:
 * whether accepted deals are announced is still open (docs/plans/merchants.md).
 */
export class CloseDealAction extends Action<CloseDealActionData> {
  override terminal = true;

  override visibility: ActionVisibility = "private";

  constructor() {
    super("close_deal", { equipment: isString, merchant: isString, deal: isIndex });
  }

  override getCost(state: Readonly<GameState>): ActionCost {
    return { ap: state.config.merchants.deal.cost.ap, mp: 0 };
  }

  /** Every deal of every merchant, at each terminal here; `validate` refuses the blocked ones. */
  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): CloseDealActionData[] {
    if (!hasTitleAccess(state, player, "comms_officer")) return [];
    return comTerminalsHere(state, player).flatMap((terminal) =>
      state.merchants.list.flatMap((m) => m.deals.map((_, deal): CloseDealActionData => ({ type: "close_deal", equipment: terminal.id, merchant: m.id, deal }))),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: CloseDealActionData): string | null {
    if (!comTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_use_comms";
    if (!hasTitleAccess(state, player, "comms_officer")) return "not_comms_officer";
    const deal = state.merchants.list.find((m) => m.id === target.merchant)?.deals[target.deal];
    if (!deal) return "no_merchant";
    if (dealBlock(state, player, deal) !== null) return "cant_pay";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: CloseDealActionData): void {
    const merchant = state.merchants.list.find((m) => m.id === target.merchant)!;
    const traded = closeDeal(state, target.merchant, target.deal);
    logPrivate(state, player.id, "merchantDealClosed", { kind: merchant.kind, traded: traded.length });
  }
}
