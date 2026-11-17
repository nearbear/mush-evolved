import { Action, type ActionCost, type ActionVisibility, isIndex, isString } from "./action.ts";
import { comTerminalsHere } from "../comms.ts";
import { logPrivate } from "../log.ts";
import { closeDeal, dealBlock, merchantsInOrbit } from "../merchants.ts";
import { findSignal, signalOption } from "../signals.ts";
import { hasTitleAccess } from "../titles.ts";
import type { GameState, PlayerState } from "../types.ts";

export type CloseDealActionData = { type: "close_deal"; equipment: string; signal: string; deal: number };

/**
 * Close a merchant's deal at the Com center terminal (owner, 2026-11-15, #143): 2 AP, for whoever has access to the
 * Comms Officer title, once the merchant was contacted (signals.ts: the `offers` step). The ship pays (merchants.ts,
 * `closeDeal`), the goods appear on the Front Storage floor, and the conversation closes as `deal`. A deal the ship
 * can't pay for is refused here and shown blocked in the Signals tab (`comms.terminal.signals`). Private (owner,
 * 2026-11-16).
 */
export class CloseDealAction extends Action<CloseDealActionData> {
  override terminal = true;

  override visibility: ActionVisibility = "private";

  constructor() {
    super("close_deal", { equipment: isString, signal: isString, deal: isIndex });
  }

  override getCost(state: Readonly<GameState>): ActionCost {
    return { ap: state.config.merchants.deal.cost.ap, mp: 0 };
  }

  /** Every deal of every contacted merchant, at each terminal here; `validate` refuses the blocked ones. */
  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): CloseDealActionData[] {
    if (!hasTitleAccess(state, player, "comms_officer")) return [];
    const open = merchantsInOrbit(state).filter((s) => signalOption(s, "deal"));
    return comTerminalsHere(state, player).flatMap((terminal) =>
      open.flatMap((s) => s.merchant!.deals.map((_, deal): CloseDealActionData => ({ type: "close_deal", equipment: terminal.id, signal: s.id, deal }))),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: CloseDealActionData): string | null {
    if (!comTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_use_comms";
    if (!hasTitleAccess(state, player, "comms_officer")) return "not_comms_officer";
    const signal = findSignal(state, target.signal);
    const deal = signal?.merchant?.deals[target.deal];
    if (!signal || !deal || !signalOption(signal, "deal")) return "no_merchant";
    if (dealBlock(state, player, deal) !== null) return "cant_pay";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: CloseDealActionData): void {
    const kind = findSignal(state, target.signal)!.merchant!.kind;
    const traded = closeDeal(state, player, target.signal, target.deal);
    logPrivate(state, player.id, "merchantDealClosed", { kind, traded: traded.length });
  }
}
