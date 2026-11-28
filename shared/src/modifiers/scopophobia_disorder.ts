import { hasCamera } from "../log.ts";
import type { Modifier } from "../modifiers.ts";
import type { GameState, PlayerState } from "../types.ts";

/** Whether the holder is being watched: a working installed camera or another living player (human or Mush) is in their room. */
export function watched(state: Readonly<GameState>, player: Readonly<PlayerState>): boolean {
  return hasCamera(state, player.room) || state.players.some((p) => p.alive && p.id !== player.id && p.room === player.room);
}

// Scopophobia (owner, 2026-11-28): a disorder, so it lasts forever and does nothing to a Mush or while calmed
// (`modifierIds`). While watched, every rolled action's success chance is x`successFactor` (relative, like Addiction's;
// an action that can't fail stays certain, `actionSuccessRate`).
export const scopophobia_disorder: Modifier = {
  actionSucessRate: (chance, { state, actor }) => (watched(state, actor) ? chance * state.config.scopophobia.successFactor : chance),
};
