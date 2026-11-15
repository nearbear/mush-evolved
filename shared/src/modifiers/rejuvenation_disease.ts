import { changeMP } from "../adjustStats.ts";
import { soil } from "../dirt.ts";
import { addDisease, diseaseAffects, withoutBedBonus } from "../diseases.ts";
import { logPrivate } from "../log.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat, rollInt } from "../rng.ts";

/** Chance to lose 1 MP at each cycle change. */
const CYCLE_MP_CHANCE = 0.5;
/** Chance to get dirty at each cycle change. */
const CYCLE_DIRTY_CHANCE = 0.1;
/** Chance, at a cycle change spent lying down, that the bed gives no extra AP. */
const NO_REST_CHANCE = 0.3;
/** Chance to catch one of `config.diseases.incidentDiseases` at each cycle change. */
const CYCLE_DISEASE_CHANCE = 0.03;

// Rejuvenation (owner, 2026-11-14): lasts 8-12 cycles (config.ts). At each cycle change: a 50% chance to lose 1 MP,
// a 10% chance to get dirty (through `soil`, so an apron or Stickler still stops it), and a 3% chance to catch a
// disease from `config.diseases.incidentDiseases` the player doesn't have yet; lying down, a 30% chance that the bed
// gives no extra AP (the bed's +1 and Lethargy's bonus). A Mush carries it without suffering any of it.
export const rejuvenation_disease: Modifier = {
  onApRefill(gain, next, player) {
    if (!player.alive || !diseaseAffects(player) || !player.modifiers.includes("lying_down")) return gain;
    return rollFloat(next) < NO_REST_CHANCE ? withoutBedBonus(gain, next, player) : gain;
  },
  onCycle(next, player) {
    if (!diseaseAffects(player)) return;
    if (rollFloat(next) < CYCLE_MP_CHANCE && player.mp > 0) changeMP(next, player, -1);
    if (rollFloat(next) < CYCLE_DIRTY_CHANCE) soil(next, player);
    if (rollFloat(next) < CYCLE_DISEASE_CHANCE) {
      const catchable = next.config.diseases.incidentDiseases.filter((d) => !player.modifiers.includes(d));
      if (catchable.length === 0) return;
      addDisease(next, player, catchable[rollInt(next, catchable.length)]!);
      logPrivate(next, player.id, "incidentDisease");
    }
  },
};
