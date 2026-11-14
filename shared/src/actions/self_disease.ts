import { addDisease } from "../diseases.ts";
import { rollInt } from "../rng.ts";
import { Action, type ActionVisibility } from "./action.ts";
import type { GameState, PlayerState } from "../types.ts";

export type SelfDiseaseActionData = { type: "self_disease" };

export class SelfDiseaseAction extends Action<SelfDiseaseActionData> {
  override visibility: ActionVisibility = "private";
  override timed = false;
  override recorded = false;

  constructor() {
    super("self_disease");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): SelfDiseaseActionData[] {
    return canSelfDisease(state, player) ? [{ type: "self_disease" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    return canSelfDisease(state, player) ? null : "illegal_action";
  }

  override apply(state: GameState, player: PlayerState): void {
    const eligible = eligibleDiseases(state, player);
    const disease = eligible[rollInt(state, eligible.length)];
    if (!disease) throw new Error("self_disease_no_eligible_disease");
    addDisease(state, player, disease);
  }
}

function canSelfDisease(state: Readonly<GameState>, player: Readonly<PlayerState>): boolean {
  return player.cheats.includes("selfDisease") && !player.isBot && player.role !== "mush" && eligibleDiseases(state, player).length > 0;
}

function eligibleDiseases(state: Readonly<GameState>, player: Readonly<PlayerState>): string[] {
  return state.config.diseases.allDiseases.filter((disease) => !player.modifiers.includes(disease));
}
