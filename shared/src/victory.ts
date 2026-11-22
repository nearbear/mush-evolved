// How the game ends (decided win conditions, docs/rules/rules-design.md): Mush win if the ship reaches Sol while any Mush
// is alive, humans win if it gets there with no Mush alive, humans win on reaching Eden even with Mush alive
// (actions/travel_to_eden.ts; owner, 2026-11-22, differs from eMush), and Mush win the moment the last living human dies
// (checked in death.ts). There is no game length limit (decided 2026-10-22).

import type { Ending, GameState, Winner } from "./types.ts";

/** Who wins if the ship reaches Sol now (owner, 2026-10-22). Not Eden, which is always a human win (owner, 2026-11-22). */
export function winnerOnArrival(state: Readonly<GameState>): Winner {
  return state.players.some((p) => p.alive && p.role === "mush") ? "mush" : "humans";
}

/** True once no living human is left. Called after a death. */
export function mushWinOnDeath(state: Readonly<GameState>): boolean {
  return state.phase === "playing" && !state.players.some((p) => p.alive && p.role === "human");
}

/** Ends the game at once with this winner: nothing more happens after it (actions, queues, cycles). Mutates a state the caller already cloned. */
export function endGame(state: GameState, winner: Winner, ending: Ending): void {
  state.phase = "ended";
  state.winner = winner;
  state.ending = ending;
}
