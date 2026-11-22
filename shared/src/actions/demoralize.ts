import { Action, IN_PRESELECTION, peopleHere, type ActionTag, type ActionVisibility, isString } from "./action.ts";
import { gainMorale } from "../adjustStats.ts";
import { logCovert } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type DemoralizeActionData = { type: "demoralize"; target: string };

/**
 * Demoralize, the Mush skill Demoralizer (`disheartening_contact`; owner, 2026-11-14):
 * `demoralize.cost.ap` (2) AP, no daily limit or cooldown, blocked in pre-selection.
 * Target (any living roommate, human or Mush) loses `demoralize.morale` (2) morale, clamped at 0;
 * offered even when the target is at 0 morale so it doesn't leak their private morale.
 * Covert (`logCovert`) and aggressive (`aggressive` tag); the victim receives the standard private
 * `loseMorale` line from `gainMorale`.
 */
export class DemoralizeAction extends Action<DemoralizeActionData> {
  override visibility: ActionVisibility = "covert";
  override tags: readonly ActionTag[] = ["aggressive", "mush"];

  constructor() {
    super("demoralize", { target: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.demoralize.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): DemoralizeActionData[] {
    if (state.preselection || player.role !== "mush" || !hasSkill(player, "disheartening_contact")) return [];
    return peopleHere(state, player).map((o) => ({ type: "demoralize", target: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: DemoralizeActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "disheartening_contact")) return "no_skill";
    return peopleHere(state, player).some((o) => o.id === target.target) ? null : "cant_see";
  }

  override apply(state: GameState, player: PlayerState, target: DemoralizeActionData): void {
    const victim = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    logCovert(state, player.id, "demoralized", { name: player.character, target: victim.character });
    gainMorale(state, victim, -state.config.demoralize.morale);
  }
}
