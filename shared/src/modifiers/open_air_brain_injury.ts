import { updateMaxValues } from "../adjustStats.ts";
import { killPlayer } from "../death.ts";
import type { Modifier } from "../modifiers.ts";

/** Max health lost. */
const MAX_HP_LOSS = 5;
/** Max morale lost. */
const MAX_MORALE_LOSS = 2;

// Open Air Brain (owner, 2026-11-18; eMushpedia Blessures): -5 max health, -2 max morale, and you die of sepsis (`sepsis`)
// after your next action resolves (`onActionDone`), when you become dirty (`onDirty`), or at the next cycle change.
export const open_air_brain_injury: Modifier = {
  maxHp: (value) => Math.max(1, value - MAX_HP_LOSS),
  maxMorale: (value) => Math.max(1, value - MAX_MORALE_LOSS),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
  onActionDone: (next, player) => killPlayer(next, player, "sepsis"),
  onDirty: (next, player) => killPlayer(next, player, "sepsis"),
  onCycle: (next, player) => killPlayer(next, player, "sepsis"),
};
