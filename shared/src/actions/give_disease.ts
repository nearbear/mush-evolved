import { Action, IN_PRESELECTION, peopleHere, type ActionTag, type ActionVisibility, isString } from "./action.ts";
import { addDisease } from "../diseases.ts";
import { logCovert } from "../log.ts";
import { rollInt } from "../rng.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type GiveDiseaseActionData = { type: "give_disease"; target: string };

/**
 * Give disease, the Mush skill Bacteriophilia (`bacterial_contact`; owner, 2026-11-21): `giveDisease.cost.ap` (1) AP,
 * no daily limit or cooldown, blocked in pre-selection. The target (any living roommate, or the Mush themselves)
 * catches a random disease from `config.diseases.mushSkillDiseases` they don't have yet (`addDisease`, so a Hygienist
 * may resist). Offered on everyone, even someone who has the whole list (then nothing happens, the AP still spent), so
 * the offer never shows what anyone has. Covert (`logCovert`, a camera reveals it), aggressive and `mush`-tagged (so
 * Black Bite makes it free on a carrier). The victim isn't told; the disease shows in their statuses.
 */
export class GiveDiseaseAction extends Action<GiveDiseaseActionData> {
  override visibility: ActionVisibility = "covert";
  override tags: readonly ActionTag[] = ["aggressive", "mush"];

  constructor() {
    super("give_disease", { target: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.giveDisease.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): GiveDiseaseActionData[] {
    if (state.preselection || player.role !== "mush" || !hasSkill(player, "bacterial_contact")) return [];
    return [player, ...peopleHere(state, player)].map((o) => ({ type: "give_disease", target: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: GiveDiseaseActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "bacterial_contact")) return "no_skill";
    return target.target === player.id || peopleHere(state, player).some((o) => o.id === target.target) ? null : "cant_see";
  }

  override apply(state: GameState, player: PlayerState, target: GiveDiseaseActionData): void {
    const victim = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    if (victim.id === player.id) logCovert(state, player.id, "gaveSelfDisease", { name: player.character });
    else logCovert(state, player.id, "gaveDisease", { name: player.character, target: victim.character });
    const catchable = state.config.diseases.mushSkillDiseases.filter((d) => !victim.modifiers.includes(d));
    if (catchable.length > 0) addDisease(state, victim, catchable[rollInt(state, catchable.length)]!);
  }
}
