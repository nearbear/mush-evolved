import { Action } from "./action.ts";
import { icarusDocked, leaveIcarus } from "../expeditions.ts";
import type { GameState, PlayerState } from "../types.ts";

export type LeaveIcarusActionData = { type: "leave_icarus" };

/**
 * Get off the docked Icarus, back into its bay (owner, 2026-11-17, docs/plans/expedition-boarding.md): free, from
 * inside while it is docked. The line is public in the bay (`leaveIcarus`).
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
    if (player.room !== state.config.expedition.craft || !icarusDocked(state)) return "not_in_icarus";
    return null;
  }

  override apply(state: GameState, player: PlayerState): void {
    leaveIcarus(state, player);
  }
}
