import { updateMaxValues } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";

export const broken_nose_injury: Modifier = {
  maxMorale: (damage, _player, state) => (damage -2 < 0) ? 1 : damage - 2,
  maxHp: (damage, _player, state) => (damage -2 < 0) ? 1 : damage - 2,
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
};