import { updateMaxValues } from "../adjustStats.ts";
import { damage } from "../death.ts";
import type { Modifier } from "../modifiers.ts";

/** Bleeding: `loss` max health, and `loss` health at each cycle change (death from it is `bled`). */
const bleeding = (loss: number): Modifier => ({
  maxHp: (value) => Math.max(1, value - loss),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
  onCycle: (next, player) => damage(next, player, loss, "bled"),
});

// Haemorrhage (owner, 2026-11-18): -1 max health, -1 health at each cycle change.
export const haemorrhage_injury = bleeding(1);

// Critical Haemorrhage (owner, 2026-11-18): -2 max health, -2 health at each cycle change.
export const critical_haemorrhage_injury = bleeding(2);
