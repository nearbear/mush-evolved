import { updateMaxValues } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";

/** Max morale lost. */
const MAX_MORALE_LOSS = 2;
/** The letters a gap-toothed mouth can't say, in either case. */
const LOST_LETTERS = /[fvstdl]/gi;

// Missing Teeth (owner, 2026-11-22): -2 max morale, and every chat message the holder sends loses its F, V, S, T, D and
// L, upper and lower case (`speech`, folded by `spokenText` in sendChat). A message left empty is refused.
export const missing_teeth_injury: Modifier = {
  maxMorale: (value) => Math.max(1, value - MAX_MORALE_LOSS),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
  speech: (text) => text.replace(LOST_LETTERS, ""),
};
