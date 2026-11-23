import { Action, IN_PRESELECTION, type ActionVisibility } from "./action.ts";
import { onExpedition } from "../expeditions.ts";
import { deface } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type DelogActionData = { type: "delog" };

/**
 * Defacer's Clear the logs (owner, 2026-11-22, as in eMush's `delog`): `delog.cost.ap` (2) AP, once a day
 * (`PlayerState.delogToday`, cleared at day start, moves with the mind), a Mush with `defacer`, not on an expedition.
 * Private: the actor gets no line of their own. Every line in the room is erased, the room gets the public `delogged`
 * notice, and no new line is written there until the cycle ends (`deface` in log.ts). Recorded, so Chitchat, torture
 * and Premonition can still reveal it afterwards.
 */
export class DelogAction extends Action<DelogActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("delog");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.delog.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): DelogActionData[] {
    return player.role === "mush" && hasSkill(player, "defacer") && !player.delogToday && !onExpedition(state, player) ? [{ type: "delog" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "defacer")) return "no_skill";
    if (onExpedition(state, player)) return "on_expedition";
    return player.delogToday ? "daily_cap" : null;
  }

  override apply(state: GameState, player: PlayerState): void {
    player.delogToday = true;
    deface(state, player.room);
  }
}
