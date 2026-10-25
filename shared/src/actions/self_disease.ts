import { addDisease } from "../adjustStats.ts";
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
    return player.cheats.includes("selfDisease") && !player.isBot && !player.modifiers.includes("cold_disease") ? [{ type: "self_disease" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    return player.cheats.includes("selfDisease") && !player.isBot && !player.modifiers.includes("cold_disease") ? null : "illegal_action";
  }

  override apply(state: GameState, player: PlayerState): void {
    addDisease(state, player, "cold_disease");
  }
}
