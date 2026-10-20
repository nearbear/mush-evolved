import { Action } from "./action.ts";
import type { GameState, PlayerState } from "../types.ts";

export type ReadyActionData = { type: "ready" };

export class ReadyAction extends Action<ReadyActionData> {
  // Ending your cycle is a choice in the top bar, not something your character does (owner, 2026-10-17).
  override timed = false;

  constructor() {
    super("ready");
  }

  // Cycles run on the clock; ending yours by hand is for testing (and later single player) only (owner, 2026-10-19).
  override getCandidates(state: Readonly<GameState>): ReadyActionData[] {
    return state.config.manualCycles ? [{ type: "ready" }] : [];
  }

  override check(state: Readonly<GameState>): string | null {
    return state.config.manualCycles ? null : "manual_cycles_off";
  }

  override getCost(): { ap: number; mp: number } {
    return { ap: 0, mp: 0 };
  }

  override apply(state: GameState, player: PlayerState): void {
    player.ready = true;
  }
}
