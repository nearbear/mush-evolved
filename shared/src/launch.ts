// Intergalactic launch (#480, owner 2026-11-22): Return to Sol and Travel to Eden start the final cycle instead of
// ending the game at once, abandoning everyone off-ship.

import { killPlayer } from "./death.ts";
import { abandonExpedition } from "./expeditions.ts";
import { loseShipsInFlight } from "./hunters.ts";
import { logPublic } from "./log.ts";
import { offShip } from "./patrol.ts";
import type { GameState, LaunchDestination, PlayerState } from "./types.ts";
import { endGame } from "./victory.ts";

/**
 * Start intergalactic travel to Sol or Eden (#480, owner 2026-11-22): record the launch, announce it ship-wide, and
 * abandon everyone off-ship (flying patrol ships, active expeditions, or lost on a planet). If those deaths leave no
 * living human, NERON destroys the ship (`ship_destroyed`, Mush win) instead of `humans_dead`. Otherwise the game
 * continues through the final cycle and ends at the next cycle change with no cycle-change processing.
 */
export function launchShip(state: GameState, player: Readonly<PlayerState>, destination: LaunchDestination): void {
  state.launched = { destination, by: player.id };
  logPublic(state, undefined, destination === "sol" ? "returnedToSol" : "returnedToEden", { name: player.character });
  loseShipsInFlight(state);
  abandonExpedition(state);
  for (const p of state.players) {
    if (p.alive && offShip(p.room)) killPlayer(state, p, "abandoned");
  }
  if (state.phase === "ended") endGame(state, "mush", "ship_destroyed");
}
