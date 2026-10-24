import { Action } from "./action.ts";
import { skillPicked } from "../modifiers.ts";
import { MUSH_SKILLS, MUSH_SKILL_SLOTS, SKILLS, SKILL_SLOTS, hasSkill, isMushSkill, isSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type PickSkillActionData = { type: "pick_skill"; skill: string };

/**
 * Pick a skill (confirmed 2026-10-15): free, permanent, any time there is an empty slot (SKILL_SLOTS), one
 * of each skill. No log line. A Mush also picks Mush skills this way, into their own slots (MUSH_SKILL_SLOTS;
 * owner, 2026-10-24); the skill id says which slots it goes in.
 */
export class PickSkillAction extends Action<PickSkillActionData> {
  constructor() {
    super("pick_skill");
  }

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): PickSkillActionData[] {
    const mush = player.role === "mush" ? MUSH_SKILLS : [];
    return [...SKILLS, ...mush].filter((s) => !hasSkill(player, s)).map((skill) => ({ type: "pick_skill", skill }));
  }

  override validate(_state: Readonly<GameState>, player: Readonly<PlayerState>, target: PickSkillActionData): string | null {
    if (isMushSkill(target.skill)) {
      if (player.role !== "mush") return "not_mush";
      if (hasSkill(player, target.skill)) return "have_skill";
      return player.mushSkills.length < MUSH_SKILL_SLOTS ? null : "no_free_slot";
    }
    if (!isSkill(target.skill)) return "no_such_skill";
    if (hasSkill(player, target.skill)) return "have_skill";
    return player.skills.length < SKILL_SLOTS ? null : "no_free_slot";
  }

  override apply(state: GameState, player: PlayerState, target: PickSkillActionData): void {
    if (isMushSkill(target.skill)) player.mushSkills.push(target.skill);
    else player.skills.push(target.skill as (typeof SKILLS)[number]);
    skillPicked(state, player, target.skill);
  }
}
