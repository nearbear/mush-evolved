import { Action, isString } from "./action.ts";
import { gainMorale } from "../adjustStats.ts";
import { DYNARCADE_EQUIPMENT, equipmentHere } from "../equipment.ts";
import { logPrivate } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type PlayArcadeActionData = { type: "play_arcade"; equipment: string };

/**
 * Play the Dynarcade (CALL_OF_DIRTY project; owner, 2026-11-14): 1 AP, any living player (including Mush) when the
 * Dynarcade is working (not broken). 33% base chance (x1.5 per miss in a row) to win +2 morale; 33% injury chance
 * (2 HP random injury). Outcome is private to the player.
 */
export class PlayArcadeAction extends Action<PlayArcadeActionData> {
  constructor() {
    super("play_arcade", { equipment: isString });
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.project.dynarcade.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): PlayArcadeActionData[] {
    return equipmentHere(state, player, DYNARCADE_EQUIPMENT).map((e) => ({ type: "play_arcade", equipment: e.id }));
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>, target: PlayArcadeActionData): string | null {
    return equipmentHere(state, player, DYNARCADE_EQUIPMENT).some((e) => e.id === target.equipment) ? null : "cant_play_arcade";
  }

  override getSuccessChance(state: Readonly<GameState>): number {
    return state.config.project.dynarcade.successChance;
  }

  override getFailureMultiplier(state: Readonly<GameState>): number {
    return state.config.project.dynarcade.failureMultiplier;
  }

  override injuryChance(state: Readonly<GameState>): number {
    return state.config.project.dynarcade.injuryChance;
  }

  override apply(state: GameState, player: PlayerState): void {
    gainMorale(state, player, state.config.project.dynarcade.morale);
    logPrivate(state, player.id, "playArcadeWin");
  }

  override fail(state: GameState, player: PlayerState): void {
    logPrivate(state, player.id, "playArcadeLose");
  }
}
