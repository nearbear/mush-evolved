// How the game ends (decided win conditions, docs/rules-design.md): Mush win if the ship returns to Sol while any Mush
// is alive, humans win if it returns with no Mush alive. Returning to Sol (actions/return_to_sol.ts) is the only ending
// built; Mush winning by every human dying is not built yet.

import type { GameState, Winner } from "./types.ts";

/** Who wins if the ship reaches Sol now. */
export function winnerOnReturn(state: Readonly<GameState>): Winner {
  return state.players.some((p) => p.alive && p.role === "mush") ? "mush" : "humans";
}

/** Ends the game at once with this winner: nothing more happens after it (actions, queues, cycles). Mutates a state the caller already cloned. */
export function endGame(state: GameState, winner: Winner): void {
  state.phase = "ended";
  state.winner = winner;
}
