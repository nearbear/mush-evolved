import { Action, type ActionCost, type ActionVisibility, isString } from "./action.ts";
import { comTerminalsHere } from "../comms.ts";
import { logPrivate } from "../log.ts";
import { contactMerchant, merchantsInOrbit } from "../merchants.ts";
import { findSignal, signalOption } from "../signals.ts";
import { hasTitleAccess } from "../titles.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ContactSignalActionData = { type: "contact_signal"; equipment: string; signal: string };

/**
 * Answer a signal's hail at the Com center terminal (owner, 2026-11-16; docs/plans/signals.md): free, for whoever has
 * access to the Comms Officer title, on a signal whose script offers Contact (a merchant that just arrived). The
 * officer's greeting and the signal's hail go into its feed, and the dialogue moves on. Private (owner, 2026-11-16: NERON's
 * arrival announcement replaced the public room line).
 */
export class ContactSignalAction extends Action<ContactSignalActionData> {
  override terminal = true;

  override visibility: ActionVisibility = "private";

  constructor() {
    super("contact_signal", { equipment: isString, signal: isString });
  }

  override getCost(): ActionCost {
    return { ap: 0, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ContactSignalActionData[] {
    if (!hasTitleAccess(state, player, "comms_officer")) return [];
    const hailing = merchantsInOrbit(state).filter((s) => signalOption(s, "contact"));
    return comTerminalsHere(state, player).flatMap((terminal) =>
      hailing.map((s): ContactSignalActionData => ({ type: "contact_signal", equipment: terminal.id, signal: s.id })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ContactSignalActionData): string | null {
    if (!comTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_use_comms";
    if (!hasTitleAccess(state, player, "comms_officer")) return "not_comms_officer";
    const signal = findSignal(state, target.signal);
    if (!signal || !signalOption(signal, "contact")) return "no_signal";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: ContactSignalActionData): void {
    const signal = findSignal(state, target.signal)!;
    contactMerchant(state, signal, player, signalOption(signal, "contact")!.next);
    logPrivate(state, player.id, "signalContacted");
  }
}
