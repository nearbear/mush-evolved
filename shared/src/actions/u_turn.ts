import { Action } from "./action.ts";
import { onExpedition, turnBack } from "../expeditions.ts";
import { hasSkill } from "../skills.ts";
import type { GameState, PlayerState } from "../types.ts";

export type UTurnActionData = { type: "u_turn" };

/**
 * The U-turn skill (`fast_backward`; owner, 2026-11-08, #358, docs/plans/expedition.md): `expedition.uTurn.cost` AP to
 * end the expedition under way at once, for a holder still with its crew. The crew comes back with what it found;
 * anyone lost stays lost. A report line names who turned back (`turnBack`); the public timer just ends.
 */
export class UTurnAction extends Action<UTurnActionData> {
  constructor() {
    super("u_turn");
  }

  override getCost(state: Readonly<GameState>): { ap: number; mp: number } {
    return { ap: state.config.expedition.uTurn.cost.ap, mp: 0 };
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): UTurnActionData[] {
    return this.validate(state, player) === null ? [{ type: "u_turn" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (!hasSkill(player, "fast_backward")) return "no_skill";
    if (!onExpedition(state, player)) return "not_on_expedition";
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    turnBack(state, player);
  }
}
