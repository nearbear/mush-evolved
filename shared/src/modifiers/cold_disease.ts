import { updateMaxValues } from "../adjustStats.ts";
import { logPrivate } from "../log.ts";
import type { Modifier } from "../modifiers.ts";
import { rollInt } from "../rng.ts";
import { changeMP } from "../adjustStats.ts";
import { diseaseAffects } from "../diseases.ts";

export const cold_disease: Modifier = {
  onCycle(next, player) {
    // Spreading at a cycle change and on an encounter is `spreadAtCycle` / `spreadOnEncounter` (diseases.ts), from config.ts.
    if (!diseaseAffects(player)) return; // a Mush spreads it but loses nothing
    if (rollInt(next, 3) !== 0 || player.mp <= 0) return;

  
    changeMP(next, player, -1);
    logPrivate(next, player.id, "coldDiseaseMpLost");
  },
  punchDamage: (damage, _player, state) => (damage -1 < 0) ? 1 : damage - 1,
  maxMorale: (damage, _player, state) => (damage -3 < 0) ? 1 : damage - 3,
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
};
