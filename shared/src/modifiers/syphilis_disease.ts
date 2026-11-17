import { updateMaxValues } from "../adjustStats.ts";
import { sneeze } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Chance to sneeze (a public log) on entering a room. */
const ENTER_SNEEZE_CHANCE = 0.16;
/** Health added to every loss of health. */
const EXTRA_DAMAGE = 2;

// Syphilis (owner, 2026-11-17): lasts 20-32 cycles and spreads by STT/DTT (config.ts). -3 max morale and -3 max
// health; every loss of health is 2 bigger; a 16% chance to sneeze (a special log) on entering a room. A Mush carries
// and spreads it without suffering it (the folds never reach a Mush's diseases; `sneeze` keeps to special logs).
export const syphilis_disease: Modifier = {
  maxMorale: (value) => (value - 3 < 0 ? 1 : value - 3),
  maxHp: (value) => (value - 3 < 0 ? 1 : value - 3),
  damageTaken: (amount) => amount + EXTRA_DAMAGE,
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
  onEnterRoom(next, player) {
    if (rollFloat(next) < ENTER_SNEEZE_CHANCE) sneeze(next, player);
  },
};
