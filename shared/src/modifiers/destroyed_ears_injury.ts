import { updateMaxValues } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";

/** Max health lost. */
const MAX_HP_LOSS = 3;
/** Max morale lost. */
const MAX_MORALE_LOSS = 1;

// Destroyed Ears (owner, 2026-11-17), Damaged Ears' upgrade: -3 max health, -1 max morale, and the same deafness (`deaf`,
// see damaged_ears_injury.ts).
export const destroyed_ears_injury: Modifier = {
  deaf: true,
  maxHp: (value) => Math.max(1, value - MAX_HP_LOSS),
  maxMorale: (value) => Math.max(1, value - MAX_MORALE_LOSS),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
};
