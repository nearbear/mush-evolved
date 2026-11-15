import { changeMP, updateMaxValues } from "../adjustStats.ts";
import { damage } from "../death.ts";
import { diseaseAffects } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Chance to lose 1 MP at each cycle change. */
const CYCLE_MP_CHANCE = 0.4;
/** Chance to lose health at each cycle change. */
const CYCLE_DAMAGE_CHANCE = 0.5;
/** Health lost when the damage roll hits. */
const CYCLE_DAMAGE = 2;

// Smallpox: at each cycle change a 40% chance to lose 1 MP and a 50% chance to lose 2 health; -2 max morale and
// -2 max health. The numbers and its 12-20 cycle duration (config.ts) are the owner's (2026-11-14).
export const smallpox_disease: Modifier = {
  onCycle(next, player) {
    if (!diseaseAffects(player)) return; // a Mush carries it but loses nothing
    if (rollFloat(next) < CYCLE_MP_CHANCE && player.mp > 0) changeMP(next, player, -1);
    if (rollFloat(next) < CYCLE_DAMAGE_CHANCE) damage(next, player, CYCLE_DAMAGE, "injury");
  },
  maxMorale: (value) => (value - 2 < 0 ? 1 : value - 2),
  maxHp: (value) => (value - 2 < 0 ? 1 : value - 2),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
};
