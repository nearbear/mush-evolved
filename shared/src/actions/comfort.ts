import { Action, peopleHere, isString, type ActionTag } from "./action.ts";
import { logPublic } from "../log.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";
import { gainMorale } from "../adjustStats.ts";

export type ComfortActionData = { type: "comfort"; target: string };

/**
 * Comfort, the Shrink's action (`shrink`; owner, 2026-10-26; eMushpedia Psy): `comfort.cost.ap` (1) AP, a living
 * roommate (human or Mush) gains `comfort.morale` (2), up to their max. No daily limit, and it is offered even when the
 * target's morale is full (the AP is then wasted), since withholding it would tell the Shrink their private morale.
 * Public room history.
 */
export class ComfortAction extends Action<ComfortActionData> {
  override tags: readonly ActionTag[] = ["talking"];
  constructor() {
    super("comfort", { target: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.comfort.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): ComfortActionData[] {
    if (!hasSkill(player, "shrink")) return [];
    return peopleHere(state, player).map((o) => ({ type: "comfort", target: o.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: ComfortActionData): string | null {
    if (!hasSkill(player, "shrink")) return "no_skill";
    return peopleHere(state, player).some((o) => o.id === target.target) ? null : "cant_see";
  }

  override apply(state: GameState, player: PlayerState, target: ComfortActionData): void {
    const comforted = state.players.find((o) => o.id === target.target)!; // checked, so it exists
    gainMorale(state, comforted, state.config.comfort.morale);
    logPublic(state, player.room, "comforted", { name: player.character, target: comforted.character });
  }
}
