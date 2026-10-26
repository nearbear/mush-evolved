import { Action, type ActionVisibility } from "./action.ts";
import { skillPicked } from "../modifiers.ts";
import { CHARACTER_SKILLS, MUSH_SKILLS, MUSH_SKILL_SLOTS, SKILLS, SKILL_SLOTS, hasSkill, isMushSkill, isSkill, type SkillId } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type PickSkillActionData = { type: "pick_skill"; skill: string };

const isAnySkill = (value: unknown): boolean => isSkill(value) || isMushSkill(value);

/**
 * Pick a skill (confirmed 2026-10-15): free, permanent, any time there is an empty slot (SKILL_SLOTS), one
 * of each skill, only from the character's own list (CHARACTER_SKILLS, owner 2026-10-25; the `anySkill` cheat
 * offers them all). No log line. A Mush also picks Mush skills this way, into their own slots (MUSH_SKILL_SLOTS;
 * owner, 2026-10-24); the skill id says which slots it goes in. Private, so roommates never see a busy bar for it:
 * a Mush picking a Mush skill must not be publicized (owner, 2026-10-24).
 */
export class PickSkillAction extends Action<PickSkillActionData> {
  override visibility: ActionVisibility = "private";

  // Choosing a skill isn't something your character does, so not in the action history.
  override recorded = false;

  constructor() {
    super("pick_skill", { skill: isAnySkill });
  }

  override getCandidates(_state: Readonly<GameState>, player: Readonly<PlayerState>): PickSkillActionData[] {
    const mush = player.role === "mush" ? MUSH_SKILLS : [];
    return [...pickable(player), ...mush].filter((s) => !hasSkill(player, s)).map((skill) => ({ type: "pick_skill", skill }));
  }

  override validate(_state: Readonly<GameState>, player: Readonly<PlayerState>, target: PickSkillActionData): string | null {
    if (isMushSkill(target.skill)) {
      if (player.role !== "mush") return "not_mush";
      if (hasSkill(player, target.skill)) return "have_skill";
      return player.mushSkills.length < MUSH_SKILL_SLOTS ? null : "no_free_slot";
    }
    if (!isSkill(target.skill)) return "no_such_skill";
    if (hasSkill(player, target.skill)) return "have_skill";
    if (!pickable(player).includes(target.skill)) return "not_your_skill";
    return player.skills.length < SKILL_SLOTS ? null : "no_free_slot";
  }

  override apply(state: GameState, player: PlayerState, target: PickSkillActionData): void {
    if (isMushSkill(target.skill)) player.mushSkills.push(target.skill);
    else player.skills.push(target.skill as SkillId);
    skillPicked(state, player, target.skill);
  }
}

/** The human skills this player may pick: their character's list, or every one with the `anySkill` cheat. */
function pickable(player: Readonly<PlayerState>): readonly SkillId[] {
  return player.cheats.includes("anySkill") ? SKILLS : CHARACTER_SKILLS[player.character];
}
