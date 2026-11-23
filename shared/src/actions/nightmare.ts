import { Action, IN_PRESELECTION, peopleHere, type ActionTag, type ActionVisibility, isString } from "./action.ts";
import { addCurse } from "../diseases.ts";
import { logCovert } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type NightmareActionData = { type: "nightmare"; target: string };

/** Living human roommates: who a Nightmarish Mush may curse. */
const cursable = (state: Readonly<GameState>, player: Readonly<PlayerState>): PlayerState[] =>
  peopleHere(state, player).filter((o) => o.role === "human");

/**
 * Curse with bad luck, the Mush skill Nightmarish (`nightmare`; owner, 2026-11-22): `nightmare.cost.ap` (2) AP, no
 * daily limit, blocked in pre-selection, on a living human roommate (lying down or not). The target gets
 * `bad_luck_curse` for 8-16 cycles; cursing someone already cursed rerolls its duration (`addCurse`). Covert
 * (`logCovert`, a camera reveals it), aggressive and `mush`-tagged. The victim is never told and never sees it.
 */
export class NightmareAction extends Action<NightmareActionData> {
  override visibility: ActionVisibility = "covert";
  override tags: readonly ActionTag[] = ["aggressive", "mush"];

  constructor() {
    super("nightmare", { target: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.nightmare.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): NightmareActionData[] {
    if (state.preselection || player.role !== "mush" || !hasSkill(player, "nightmare")) return [];
    return cursable(state, player).map((o) => ({ type: "nightmare", target: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: NightmareActionData): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (player.role !== "mush") return "not_mush";
    if (!hasSkill(player, "nightmare")) return "no_skill";
    return cursable(state, player).some((o) => o.id === target.target) ? null : "cant_see";
  }

  override apply(state: GameState, player: PlayerState, target: NightmareActionData): void {
    const victim = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    logCovert(state, player.id, "cursedBadLuck", { name: player.character, target: victim.character });
    addCurse(state, victim, "bad_luck_curse");
  }
}
