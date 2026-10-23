// How the game ends (decided win conditions, docs/rules-design.md): Mush win if the ship returns to Sol while any Mush
// is alive, humans win if it returns with no Mush alive, and Mush win the moment the last living human dies (checked in
// death.ts). There is no game length limit (decided 2026-10-22).

import type { GameState, Winner } from "./types.ts";

/** Who wins if the ship reaches Sol now. */
export function winnerOnReturn(state: Readonly<GameState>): Winner {
  return state.players.some((p) => p.alive && p.role === "mush") ? "mush" : "humans";
}

/** True once no living human is left. Called after a death. */
export function mushWinOnDeath(state: Readonly<GameState>): boolean {
  return state.phase === "playing" && !state.players.some((p) => p.alive && p.role === "human");
}

/** Ends the game at once with this winner: nothing more happens after it (actions, queues, cycles). Mutates a state the caller already cloned. */
export function endGame(state: GameState, winner: Winner): void {
  state.phase = "ended";
  state.winner = winner;
}
