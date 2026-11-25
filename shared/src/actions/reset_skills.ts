import { Action, type ActionVisibility } from "./action.ts";
import { pruneFairyRings } from "../fairyRings.ts";
import { hasSkill } from "../skills.ts";
import { removeStatus } from "../statuses.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ResetSkillsActionData = { type: "reset_skills" };

/**
 * Epigenetics, the Mush skill `epigenetics` (owner, 2026-11-13): once per game, 2 AP (`resetSkills.cost.ap`), a Mush
 * drops every Mush skill except Epigenetics, freeing those slots to pick again. Human skills are untouched. Private,
 * offered even with nothing to drop (the use is then wasted). The used flag follows the mind, like the skills.
 */
export class ResetSkillsAction extends Action<ResetSkillsActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("reset_skills");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.resetSkills.cost.ap, mp: 0 };
  }

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): ResetSkillsActionData[] {
    return this.validate(_state, player) === null ? [{ type: "reset_skills" }] : [];
  }

  override validate(_state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "epigenetics")) return "no_skill";
    if (player.epigeneticsUsed) return "already_used";
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    player.mushSkills = player.mushSkills.filter((s) => s === "epigenetics");
    pruneFairyRings(state); // losing Mycelium Spirit removes your Fairy Ring (owner, 2026-11-25)
    removeStatus(player, "nimble");
    removeStatus(player, "ninja");
    player.epigeneticsUsed = true;
  }
}
