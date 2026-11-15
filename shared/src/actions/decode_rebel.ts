import { Action, type ActionCost, type ActionVisibility, isString } from "./action.ts";
import { canUseComms, comTerminalsHere, isOpen, REBEL_COMPLETE, rebelReached, rollRebelGain } from "../comms.ts";
import { logPrivate } from "../log.ts";
import { rebelGain } from "../modifiers.ts";
import type { GameState, PlayerState } from "../types.ts";

export type DecodeRebelActionData = { type: "decode_rebel"; equipment: string; base: string };

/**
 * Decode a rebel base's signal at the Com center terminal (owner, 2026-10-21): 2 AP (free with a Computer point, which is
 * spent), for the Comms Officer while the link with Sol is up, not dirty, Mush included. Only a base whose call is open
 * (it called and hasn't expired). The gain is rolled in comms.ts; at 100% the base is reached and its bonus applies.
 * Private: only the decoder gets a log line, though anyone at the terminal sees the progress.
 */
export class DecodeRebelAction extends Action<DecodeRebelActionData> {
  override terminal = true;

  override visibility: ActionVisibility = "private";

  constructor() {
    super("decode_rebel", { equipment: isString, base: isString });
  }

  override getCost(state: Readonly<GameState>, player: Readonly<PlayerState>): ActionCost {
    return player.resources.comp > 0 ? { ap: 0, mp: 0, paidBy: "comp" } : { ap: state.config.comms.rebel.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): DecodeRebelActionData[] {
    if (!canUseComms(state, player)) return [];
    const open = state.comms.rebels.filter((call) => isOpen(state, call));
    return comTerminalsHere(state, player).flatMap((terminal) =>
      open.map((call): DecodeRebelActionData => ({ type: "decode_rebel", equipment: terminal.id, base: call.base })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: DecodeRebelActionData): string | null {
    if (!comTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_use_comms";
    if (!state.comms.linked) return "no_link";
    if (!canUseComms(state, player)) return "not_comms_officer";
    const call = state.comms.rebels.find((c) => c.base === target.base);
    if (!call || !isOpen(state, call)) return "no_rebel_call";
    if (player.statuses.includes("dirty")) return "dirty";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: DecodeRebelActionData): void {
    const call = state.comms.rebels.find((c) => c.base === target.base)!;
    call.progress = Math.min(REBEL_COMPLETE, call.progress + rebelGain(state, player, rollRebelGain(state, player)));
    if (call.progress < REBEL_COMPLETE) {
      logPrivate(state, player.id, "rebelDecoded", { base: call.base, percent: call.progress });
      return;
    }
    rebelReached(state, call.base);
    logPrivate(state, player.id, "rebelContacted", { base: call.base });
  }
}
