import { updateMaxValues } from "../adjustStats.ts";
import { diseaseAffects } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";
import { addStatus } from "../statuses.ts";

export const fungal_infection_disease: Modifier = {
  onCycle(next, player) {
    if (!diseaseAffects(player)) return;
    addStatus(player, "Dirty");
  },
  maxMorale: (damage, _player, state) => (damage -2 < 0) ? 1 : damage - 2,
  maxHp: (damage, _player, state) => (damage -2 < 0) ? 1 : damage - 2,
  contaminationCapacity: (amount, _player, state) => (amount -1 < 0) ? 1 : amount - 1,
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
};