import { updateMaxValues } from "../adjustStats.ts";
import { logPrivate } from "../log.ts";
import { maxMorale, type Modifier } from "../modifiers.ts";
import { nextInt } from "../rng.ts";

export const cold_disease: Modifier = {
  onCycle(next, player) {
    const [roll, rng] = nextInt(next.rng, 3);
    next.rng = rng;
    if (roll !== 0 || player.mp <= 0) return;

    player.mp -= 1;
    logPrivate(next, player.id, "coldDiseaseMpLost");
  },
  punchDamage: (damage, _player, state) => (damage -1 < 0) ? 1 : damage - 1,
  maxMorale: (damage, _player, state) => (damage -3 < 0) ? 1 : damage - 3,
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
};
