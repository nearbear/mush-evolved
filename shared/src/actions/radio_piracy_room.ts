import { Action, IN_PRESELECTION, peopleHere, type ActionVisibility, isString } from "./action.ts";
import { logPrivate } from "../log.ts";
import { placeHack } from "../radioPiracy.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type RadioPiracyRoomActionData = { type: "radio_piracy_room"; target: string };

/**
 * Radio Piracy in person (owner, 2026-11-26): the same hack as the Com center's (actions/radio_piracy.ts), for
 * `radioPiracy.inRoomCost.ap` (2) AP, on a living player in the hacker's room instead of at the terminal. It shares the
 * once-a-day limit (`PlayerState.radioHackToday`) with the Com center version, is private like it, and has the same
 * name for players; it sits on the target's own panel.
 */
export class RadioPiracyRoomAction extends Action<RadioPiracyRoomActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("radio_piracy_room", { target: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.radioPiracy.inRoomCost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): RadioPiracyRoomActionData[] {
    if (player.role !== "mush" || !hasSkill(player, "radio_piracy") || player.radioHackToday) return [];
    return peopleHere(state, player).map((o) => ({ type: "radio_piracy_room", target: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: RadioPiracyRoomActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "radio_piracy")) return "no_skill";
    if (!peopleHere(state, player).some((o) => o.id === target.target)) return "cant_see";
    return player.radioHackToday ? "daily_cap" : null;
  }

  override apply(state: GameState, player: PlayerState, target: RadioPiracyRoomActionData): void {
    placeHack(state, player, target.target);
    logPrivate(state, player.id, "radioHacked", { target: state.players.find((o) => o.id === target.target)!.character });
  }
}
