import { Action, isString } from "./action.ts";
import { gainMorale } from "../adjustStats.ts";
import { revealHistory } from "../history.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type PremonitionActionData = { type: "premonition"; target: string };

/**
 * The Premonition skill's action (`premonition`; owner, 2026-11-13; eMushpedia Pressentiment): costs `premonition.moraleCost`
 * (1) morale and no AP, and shows you one living crewmate's most recent action, wherever they are (history.ts: the
 * action's name only, newest first, or "nothing" if they have done none). No daily limit. It needs the morale to pay, so
 * it is refused at 0. Unlogged (the wiki): no public line, and it isn't kept in your own action history, so a Torturer
 * or Confident can't reveal that you used it.
 */
export class PremonitionAction extends Action<PremonitionActionData> {
  override visibility = "private" as const;
  override recorded = false;

  constructor() {
    super("premonition", { target: isString });
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): PremonitionActionData[] {
    if (!hasSkill(player, "premonition") || player.morale < state.config.premonition.moraleCost) return [];
    return state.players.filter((o) => o.alive && o.id !== player.id).map((o) => ({ type: "premonition", target: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: PremonitionActionData): string | null {
    if (!hasSkill(player, "premonition")) return "no_skill";
    if (player.morale < state.config.premonition.moraleCost) return "no_morale";
    return state.players.some((o) => o.alive && o.id !== player.id && o.id === target.target) ? null : "cant_see";
  }

  override apply(state: GameState, player: PlayerState, target: PremonitionActionData): void {
    const subject = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    gainMorale(state, player, -state.config.premonition.moraleCost);
    revealHistory(state, player, subject, 1);
  }
}
