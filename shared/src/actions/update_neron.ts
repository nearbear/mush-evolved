import { Action, type ActionVisibility } from "./action.ts";
import { advanceNeron, canUseComms, comTerminalsHere } from "../comms.ts";
import { logPrivate } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type UpdateNeronActionData = { type: "update_neron"; equipment: string };

/**
 * Work on NERON's next update at the Com center terminal (owner, 2026-10-21): 2 AP, 25% per action, for the Comms
 * Officer while the link with Sol is up, not dirty, Mush included. It repeats: each update raises NERON's version and
 * completes a random unfinished NERON project (comms.ts). Private: only the actor gets a log line.
 */
export class UpdateNeronAction extends Action<UpdateNeronActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("update_neron");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.comms.neron.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): UpdateNeronActionData[] {
    if (!canUseComms(state, player)) return [];
    return comTerminalsHere(state, player).map((terminal): UpdateNeronActionData => ({ type: "update_neron", equipment: terminal.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: UpdateNeronActionData): string | null {
    if (!comTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_use_comms";
    if (!state.comms.linked) return "no_link";
    if (!canUseComms(state, player)) return "not_comms_officer";
    if (player.statuses.includes("dirty")) return "dirty";
    return null;
  }

  override apply(state: GameState, player: PlayerState, _target: UpdateNeronActionData): void {
    const version = state.comms.neron.version;
    const project = advanceNeron(state, state.config.comms.neron.progressPercent);
    if (state.comms.neron.version === version) {
      logPrivate(state, player.id, "neronUpdating", { percent: state.comms.neron.progress });
      return;
    }
    const params = { version: state.comms.neron.version };
    if (project) logPrivate(state, player.id, "neronUpdatedProject", { ...params, project });
    else logPrivate(state, player.id, "neronUpdated", params);
  }
}
