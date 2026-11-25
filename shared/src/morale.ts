// Morale at 0 (owner, 2026-11-11). A living player at 0 morale is Hopeless (`isHopeless`, a private status, Mush
// included); any morale gain ends it. When a cycle ends, every human still Hopeless dies, all at once (each death
// charges every living player via `killPlayer`). A Mush never dies of it. Resolving at the cycle's end rather than at
// once means a death's morale cost can only push others to 0 for the next cycle, so a chain moves one cycle at a time
// and leaves room to respond.

import { shipInvincible } from "./cheats.ts";
import { killPlayer } from "./death.ts";
import { isHopeless } from "./statuses.ts";
import type { GameState } from "./types.ts";

/** Kills the humans still Hopeless as a cycle ends. Mutates a state the caller already cloned. */
export function hopelessCycle(state: GameState): void {
  if (shipInvincible(state)) return;
  const dying = state.players.filter((p) => p.role === "human" && isHopeless(p) && !p.cheats.includes("infiniteMorale"));
  for (const p of dying) killPlayer(state, p, "depression");
}
