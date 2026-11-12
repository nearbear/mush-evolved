import { gainMorale, updateMaxValues } from "../adjustStats.ts";
import { damage } from "../death.ts";
//import { logPrivate } from "../log.ts";
import type { Modifier } from "../modifiers.ts";

export const extreme_tinnitus_disease: Modifier = {
  onShipMovement(next, player) {
    damage(next, player, 2, "injury");
    gainMorale(next, player, -2);
  },
  maxMorale: (damage, _player, state) => (damage -3 < 0) ? 1 : damage - 3,
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
};