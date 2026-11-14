import { addDisease } from "../diseases.ts";
import { rollInt } from "../rng.ts";
import type { StatusId } from "../statuses.ts";
import { Action, type ActionVisibility } from "./action.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SelfInjuryActionData = { type: "self_injury" };

export class SelfInjuryAction extends Action<SelfInjuryActionData> {
  override visibility: ActionVisibility = "private";
  override timed = false;
  override recorded = false;

  constructor() {
    super("self_injury");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SelfInjuryActionData[] {
    return canSelfInjure(state, player) ? [{ type: "self_injury" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    return canSelfInjure(state, player) ? null : "illegal_action";
  }

  override apply(state: GameState, player: PlayerState): void {
    const eligible = eligibleInjuries(state, player);
    const injury = eligible[rollInt(state, eligible.length)];
    if (!injury) throw new Error("self_injury_no_eligible_injury");
    addDisease(state, player, injury);
  }
}

function canSelfInjure(state: Readonly<GameState>, player: Readonly<PlayerState>): boolean {
  return player.cheats.includes("selfDisease") && !player.isBot && eligibleInjuries(state, player).length > 0;
}

function eligibleInjuries(state: Readonly<GameState>, player: Readonly<PlayerState>): StatusId[] {
  return state.config.diseases.allInjuries.filter((injury) => !player.modifiers.includes(injury));
}
