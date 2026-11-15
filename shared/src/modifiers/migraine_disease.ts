import { diseaseAffects, withoutBedBonus } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Chance, at a cycle change spent lying down, that the bed gives no extra AP. */
const NO_REST_CHANCE = 0.3;
/** What a NERON update or a rebel decode is worth, relative. */
const COMMS_FACTOR = 0.5;

// Migraine (owner, 2026-11-15): lasts 8-12 cycles (config.ts). A remote planet analysis reveals 1 sector less; a
// NERON update or a rebel base decode is worth half (rounded down; actions/update_neron.ts and decode_rebel.ts, through
// the `neronProgress` and `rebelGain` folds); each relay contribution (research, NERON projects, PILGRED) is worth
// `MIGRAINE_RELAY_MALUS` less (relay.ts); lying down, a 30% chance that the bed gives no extra AP, as with
// Rejuvenation. A Mush carries it without suffering any of it.
export const migraine_disease: Modifier = {
  analysisSectors: (sectors) => sectors - 1,
  neronProgress: (percent) => Math.floor(percent * COMMS_FACTOR),
  rebelGain: (gain) => Math.floor(gain * COMMS_FACTOR),
  onApRefill(gain, next, player) {
    if (!player.alive || !diseaseAffects(player) || !player.modifiers.includes("lying_down")) return gain;
    return rollFloat(next) < NO_REST_CHANCE ? withoutBedBonus(gain, next, player) : gain;
  },
};
