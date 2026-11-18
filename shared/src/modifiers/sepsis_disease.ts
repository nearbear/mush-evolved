import { gainMorale } from "../adjustStats.ts";
import { damage } from "../death.ts";
import { diseaseAffects } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";

/** Health lost when the disease is caught. */
const CONTRACT_DAMAGE = 6;
/** Health lost at each cycle change. */
const CYCLE_DAMAGE = 4;
/** Morale lost at each cycle change. */
const CYCLE_MORALE = 1;

// Sepsis (owner, 2026-11-17): what a failed surgery gives the patient, for 1-3 cycles (config.ts). -6 health when caught,
// then -4 health and -1 morale at each cycle change. Death from it is `sepsis`. A Mush carries it but loses nothing.
export const sepsis_disease: Modifier = {
  onPick(next, player) {
    if (diseaseAffects(player)) damage(next, player, CONTRACT_DAMAGE, "sepsis");
  },
  onCycle(next, player) {
    if (!diseaseAffects(player)) return;
    gainMorale(next, player, -CYCLE_MORALE);
    damage(next, player, CYCLE_DAMAGE, "sepsis");
  },
};
