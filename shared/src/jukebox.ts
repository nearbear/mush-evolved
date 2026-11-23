// The jukebox (BEAT_BOX project; owner, 2026-11-22): each cycle it plays the favourite song of one living player.

import { nextInt, streamFor } from "./rng.ts";
import type { GameState, PlayerState } from "./types.ts";

/**
 * Whose song plays `offset` cycles from now (0: this cycle), or undefined with nobody alive. The pick is fixed per cycle
 * (as eMush seeds it with the cycles elapsed plus the offset), from `state.jukeboxSeed` rather than `state.rng`, so asking
 * never moves a shared roll. It draws from the living players in seat order (eMush also counts the dead), so a death
 * can change the songs to come.
 */
export function songAt(state: Readonly<Pick<GameState, "players" | "cycle" | "jukeboxSeed">>, offset = 0): Readonly<PlayerState> | undefined {
  const living = state.players.filter((p) => p.alive);
  if (living.length === 0) return undefined;
  const [index] = nextInt(streamFor(state.jukeboxSeed, `cycle-${state.cycle + offset}`), living.length);
  return living[index];
}
