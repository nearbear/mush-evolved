import { Action } from "./action.ts";
import { isAboard, leaveIcarus } from "../expeditions.ts";
import type { GameState, PlayerState } from "../types.ts";

export type LeaveIcarusActionData = { type: "leave_icarus" };

/**
 * Get off the docked Icarus (owner, 2026-11-17, docs/plans/archive/expedition-boarding.md): free, while aboard it. The player
 * never left the bay (#469). The line is public in the bay (`leaveIcarus`).
 */
export class LeaveIcarusAction extends Action<LeaveIcarusActionData> {
  constructor() {
    super("leave_icarus");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): LeaveIcarusActionData[] {
    return this.validate(state, player) === null ? [{ type: "leave_icarus" }] : [];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (!player.alive) return "dead";
    if (!isAboard(state, player)) return "not_in_icarus";
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    leaveIcarus(state, player);
  }
}
