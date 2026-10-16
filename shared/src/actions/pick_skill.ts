import { Action } from "./action.ts";
import { SKILLS, SKILL_SLOTS, isSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type PickSkillActionData = { type: "pick_skill"; skill: string };

/**
 * Pick a skill (confirmed 2026-10-15): free, permanent, any time there is an empty slot (SKILL_SLOTS), one
 * of each skill. No log line.
 */
export class PickSkillAction extends Action<PickSkillActionData> {
  constructor() {
    super("pick_skill");
  }

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): PickSkillActionData[] {
    return SKILLS.filter((s) => !player.skills.includes(s)).map((skill) => ({ type: "pick_skill", skill }));
  }

  override check(_state: Readonly<GameState>, player: Readonly<PlayerState>, target: PickSkillActionData): string | null {
    if (!isSkill(target.skill)) return "no_such_skill";
    if (player.skills.includes(target.skill)) return "have_skill";
    return player.skills.length < SKILL_SLOTS ? null : "no_free_slot";
  }

  override apply(_state: GameState, player: PlayerState, target: PickSkillActionData): void {
    player.skills.push(target.skill as (typeof SKILLS)[number]);
  }
}
