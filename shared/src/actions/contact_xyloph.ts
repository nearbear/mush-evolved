import { Action, type ActionVisibility } from "./action.ts";
import { applyXyloph, canUseComms, comTerminalsHere, drawXyloph, xylophLeft } from "../comms.ts";
import { logPrivate } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ContactXylophActionData = { type: "contact_xyloph"; equipment: string };

/**
 * Contact Xyloph, the Daedalus's home port, at the Com center terminal (owner, 2026-10-21): 2 AP, for the Comms Officer
 * while the link with Sol is up, not dirty, Mush included. It always works: one database entry is drawn by weight from
 * those not drawn yet, and once all are drawn the action is gone. Private: only the actor learns the entry.
 */
export class ContactXylophAction extends Action<ContactXylophActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("contact_xyloph");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.comms.xyloph.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ContactXylophActionData[] {
    if (!canUseComms(state, player) || xylophLeft(state).length === 0) return [];
    return comTerminalsHere(state, player).map((terminal): ContactXylophActionData => ({ type: "contact_xyloph", equipment: terminal.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ContactXylophActionData): string | null {
    if (!comTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_use_comms";
    if (!state.comms.linked) return "no_link";
    if (!canUseComms(state, player)) return "not_comms_officer";
    if (xylophLeft(state).length === 0) return "xyloph_done";
    if (player.statuses.includes("dirty")) return "dirty";
    return null;
  }

  override apply(state: GameState, player: PlayerState, _target: ContactXylophActionData): void {
    const entry = drawXyloph(state);
    if (!entry) return;
    state.comms.xyloph.push(entry);
    applyXyloph(state, entry);
    logPrivate(state, player.id, "xylophContacted", { entry });
  }
}
