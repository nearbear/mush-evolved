import { updateMaxValues } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";

/** Max health lost. */
const MAX_HP_LOSS = 2;

// Damaged Ears (owner, 2026-11-17): -2 max health, and you can't hear other players on the iTrackie: every message another
// player posts while you have it, in any channel, is never sent to you, even once it's cured, and never counts as unread
// (`deaf`: `pushChat` records it in `PlayerState.unheard`, `heardBy` filters). Your own messages and the game's system
// messages still arrive, and you can still post.
export const damaged_ears_injury: Modifier = {
  deaf: true,
  maxHp: (value) => Math.max(1, value - MAX_HP_LOSS),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
};
