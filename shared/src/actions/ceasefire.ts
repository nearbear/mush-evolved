import { Action, IN_PRESELECTION, type ActionCost } from "./action.ts";
import { logPublic } from "../log.ts";
import type { GameState, PlayerState } from "../types.ts";

export type CeasefireActionData = { type: "ceasefire" };

/**
 * Diplomat's Ceasefire (owner, 2026-11-17): 1 AP, once per game per character (stays with the body on Transfer;
 * Polymath/`skilful` does not get it). Public room log; sets a room ceasefire for `ceasefire.durationCycles` (3)
 * cycles, blocking all `aggressive`-tagged actions in that room even if the diplomat leaves or dies.
 */
export class CeasefireAction extends Action<CeasefireActionData> {
  constructor() {
    super("ceasefire");
  }

  override getCandidates(state: Readonly<GameState>, player: Readonly<PlayerState>): CeasefireActionData[] {
    if (state.preselection) return [];
    if (!player.skills.includes("diplomacy")) return [];
    if (player.ceasefireUsed) return [];
    return [{ type: "ceasefire" }];
  }

  override validate(state: Readonly<GameState>, player: Readonly<PlayerState>): string | null {
    if (state.preselection) return IN_PRESELECTION;
    if (!player.skills.includes("diplomacy")) return "no_skill";
    if (player.ceasefireUsed) return "ceasefire_used";
    if ((state.ceasefires[player.room] ?? 0) > 0) return "already_ceasefire";
    return null;
  }

  override getCost(state: Readonly<GameState>): ActionCost {
    return { ap: state.config.ceasefire.cost.ap, mp: 0 };
  }

  override apply(state: GameState, player: PlayerState): void {
    player.ceasefireUsed = true;
    state.ceasefires[player.room] = state.config.ceasefire.durationCycles;
    logPublic(state, player.room, "ceasefire", { name: player.character });
  }
}
