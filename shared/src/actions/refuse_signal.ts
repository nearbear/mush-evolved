import { Action, type ActionCost, type ActionVisibility, isString } from "./action.ts";
import { comTerminalsHere } from "../comms.ts";
import { logPrivate } from "../log.ts";
import { merchantsInOrbit, refuseMerchant } from "../merchants.ts";
import { findSignal, signalOption } from "../signals.ts";
import { hasTitleAccess } from "../titles.ts";
import type { GameState, PlayerState } from "../types.ts";

export type RefuseSignalActionData = { type: "refuse_signal"; equipment: string; signal: string };

/**
 * No thank you (owner, 2026-11-16; docs/plans/signals.md): free, for whoever has access to the Comms Officer title,
 * on a contacted merchant (the `offers` step). The officer declines, the ship says farewell, and the conversation
 * closes as `refused`. Private.
 */
export class RefuseSignalAction extends Action<RefuseSignalActionData> {
  override terminal = true;

  override visibility: ActionVisibility = "private";

  constructor() {
    super("refuse_signal", { equipment: isString, signal: isString });
  }

  override getCost(): ActionCost {
    return { ap: 0, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): RefuseSignalActionData[] {
    if (!hasTitleAccess(state, player, "comms_officer")) return [];
    const open = merchantsInOrbit(state).filter((s) => signalOption(s, "refuse"));
    return comTerminalsHere(state, player).flatMap((terminal) => open.map((s): RefuseSignalActionData => ({ type: "refuse_signal", equipment: terminal.id, signal: s.id })));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: RefuseSignalActionData): string | null {
    if (!comTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_use_comms";
    if (!hasTitleAccess(state, player, "comms_officer")) return "not_comms_officer";
    const signal = findSignal(state, target.signal);
    if (!signal || !signalOption(signal, "refuse")) return "no_signal";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: RefuseSignalActionData): void {
    refuseMerchant(state, findSignal(state, target.signal)!, player);
    logPrivate(state, player.id, "signalRefused");
  }
}
