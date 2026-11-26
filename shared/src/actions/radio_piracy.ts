import { Action, IN_PRESELECTION, type ActionVisibility, isString } from "./action.ts";
import { comTerminalsHere } from "../comms.ts";
import { logPrivate } from "../log.ts";
import { placeHack } from "../radioPiracy.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type RadioPiracyActionData = { type: "radio_piracy"; equipment: string; target: string };

/**
 * Radio Piracy, reworked (owner, 2026-11-18, radioPiracy.ts): `radioPiracy.cost.ap` (3) AP at the Com center terminal,
 * once a day (`PlayerState.radioHackToday`), a Mush with `radio_piracy`. Any other living player, anywhere aboard or
 * not, Mush teammates included. Places a hack on the target's iTrackie, replacing the hacker's last one. No `spore`
 * tag, so myco alarms don't ring. Private: only the hacker gets a line, and the target is never told.
 */
export class RadioPiracyAction extends Action<RadioPiracyActionData> {
  override terminal = true;

  override visibility: ActionVisibility = "private";

  constructor() {
    super("radio_piracy", { equipment: isString, target: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.radioPiracy.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): RadioPiracyActionData[] {
    if (player.role !== "mush" || !hasSkill(player, "radio_piracy") || player.radioHackToday) return [];
    const targets = state.players.filter((o) => o.id !== player.id && o.alive);
    return comTerminalsHere(state, player).flatMap((terminal) => targets.map((o): RadioPiracyActionData => ({ type: "radio_piracy", equipment: terminal.id, target: o.id })));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: RadioPiracyActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "radio_piracy")) return "no_skill";
    if (!comTerminalsHere(state, player).some((terminal) => terminal.id === target.equipment)) return "cant_use_comms";
    const victim = state.players.find((o) => o.id === target.target);
    if (!victim || victim.id === player.id || !victim.alive) return "no_target";
    return player.radioHackToday ? "daily_cap" : null;
  }

  override apply(state: GameState, player: PlayerState, target: RadioPiracyActionData): void {
    placeHack(state, player, target.target);
    logPrivate(state, player.id, "radioHacked", { target: state.players.find((o) => o.id === target.target)!.character });
  }
}
