import { Action, peopleHere, type ActionVisibility, isString } from "./action.ts";
import { skillPicked } from "../modifiers.ts";
import { hasSkill, isSkill, type SkillId } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ApprenticeshipActionData = { type: "apprenticeship"; target: string; skill: string };

/**
 * Apprenticeship, granted by the Apprentice skill (owner, 2026-11-05): for `apprenticeship.cost.ap` AP, copy a human
 * skill that a living crewmate in your room has selected (their picked skills, or their book skill), that you don't
 * already have. Once per game and permanent: the copied skill takes Apprentice's place, so Apprentice is gone and the
 * action can't be repeated; no free slot is needed. Mush skills can't be copied. Private: no room log line.
 */
export class ApprenticeshipAction extends Action<ApprenticeshipActionData> {
  override visibility: ActionVisibility = "private";

  constructor() {
    super("apprenticeship", { target: isString, skill: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.apprenticeship.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ApprenticeshipActionData[] {
    if (!player.skills.includes("apprentice")) return [];
    return copyable(state, player).map(({ teacher, skill }) => ({ type: "apprenticeship", target: teacher, skill }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ApprenticeshipActionData): string | null {
    if (!player.skills.includes("apprentice")) return "no_skill";
    if (!isSkill(target.skill)) return "no_such_skill";
    if (hasSkill(player, target.skill)) return "have_skill";
    const teacher = peopleHere(state, player).find((o) => o.id === target.target);
    if (!teacher) return "cant_see";
    return copyable(state, player).some((c) => c.teacher === teacher.id && c.skill === target.skill) ? null : "nobody_has_it";
  }

  override apply(state: GameState, player: PlayerState, target: ApprenticeshipActionData): void {
    player.skills[player.skills.indexOf("apprentice")] = target.skill as SkillId;
    player.apprenticeUsed = true;
    skillPicked(state, player, target.skill);
  }
}

/** Each human skill a living other in the room holds that this player doesn't have, with who holds it. Skills are public to the room, so listing them leaks nothing. */
function copyable(state: Readonly<GameState>, player: Readonly<PlayerState>): { teacher: string; skill: SkillId }[] {
  return peopleHere(state, player).flatMap((other) =>
    [...other.skills, ...(other.bookSkill === undefined ? [] : [other.bookSkill])]
      .filter((s): s is SkillId => isSkill(s) && !hasSkill(player, s))
      .map((skill) => ({ teacher: other.id, skill })),
  );
}
