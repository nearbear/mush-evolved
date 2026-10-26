import { Action, type ActionVisibility } from "./action.ts";
import { biosTerminalsHere, BIOS_OPTIONS, canChangeBios, type BiosOption } from "../bios.ts";
import { logPrivate } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SetBiosActionData = { type: "set_bios"; equipment: string; option: BiosOption; value: boolean };

/**
 * Switch one of NERON's BIOS options at the BIOS terminal (owner, 2026-10-21): free, NERON Admin only (bios.ts), Mush
 * included. Private: only the actor gets a log line; the settings themselves show to anyone at the terminal.
 */
export class SetBiosAction extends Action<SetBiosActionData> {
  override visibility: ActionVisibility = "private";

  // BIOS changes are left out of the action history, as in eMush (owner, 2026-10-24).
  override recorded = false;

  constructor() {
    super("set_bios");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SetBiosActionData[] {
    if (!canChangeBios(state, player)) return [];
    return biosTerminalsHere(state, player).flatMap((terminal) =>
      BIOS_OPTIONS.map((option): SetBiosActionData => ({ type: "set_bios", equipment: terminal.id, option, value: !state.bios[option] })),
    );
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: SetBiosActionData): string | null {
    if (!biosTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_use_bios";
    if (!canChangeBios(state, player)) return "not_neron_admin";
    if (state.bios[target.option] === target.value) return "bios_unchanged";
    return null;
  }

  override apply(state: GameState, player: PlayerState, target: SetBiosActionData): void {
    state.bios[target.option] = target.value;
    logPrivate(state, player.id, LOG_KEYS[target.option][target.value ? "on" : "off"]);
  }
}

/** One whole sentence per option and value (i18n rule 2), rather than a translated option name in a shared line. */
const LOG_KEYS: Record<BiosOption, { on: string; off: string }> = {
  actopi: { on: "biosActopiOn", off: "biosActopiOff" },
  death_announcements: { on: "biosDeathsOn", off: "biosDeathsOff" },
  plasma_shield: { on: "biosShieldOn", off: "biosShieldOff" },
};
