// Fairy Rings (Mush skill Mycelium Spirit, `mycellium_spirit`; owner, 2026-11-25).
// A Mush with the skill grows one ring per mind in their current room (`grow_fairy_ring`, 1 AP and 2 spores). Once a
// day, one Mush may draw a spore from it (`tap_fairy_ring`): no dirt, and outside the faction's daily spore cap. Rings
// are invisible to humans; a living Mush sees only whether their own room has one (`PlayerView.roomFairyRing`). A ring
// lasts while its creator's mind plays a living Mush with the skill, so death, a cure or Epigenetics remove it
// (`pruneFairyRings`), while a Transfer keeps it (the skill moves with the mind).

import { hasSkill } from "./skills.ts";
import type { FairyRing, GameState, RoomId } from "./types.ts";

/** The Fairy Ring in `room`, if any (one per room at most). */
export function fairyRingIn(state: Readonly<GameState>, room: RoomId): Readonly<FairyRing> | undefined {
  return state.fairyRings.find((ring) => ring.room === room);
}

/**
 * Removes every ring whose creator no longer plays a living Mush with Mycelium Spirit. Silent: nobody is told
 * (owner, 2026-11-25). Call after a death, a cure, or a skill reset. Mutates a state the caller already cloned.
 */
export function pruneFairyRings(state: GameState): void {
  state.fairyRings = state.fairyRings.filter((ring) => {
    const body = state.players.find((p) => p.mind === ring.owner);
    return body !== undefined && body.alive && body.role === "mush" && hasSkill(body, "mycellium_spirit");
  });
}
