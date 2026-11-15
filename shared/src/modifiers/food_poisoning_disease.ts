import { updateMaxValues } from "../adjustStats.ts";
import { vomit } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Chance to vomit on entering a room. */
const ENTER_VOMIT_CHANCE = 0.16;

// Food Poisoning (owner, 2026-11-15): lasts 8-12 cycles (config.ts). -3 max health and -3 max morale; a 16% chance to
// vomit on entering a room (special logs; it dirties a crewmate there, `vomit`); every loss of health is 1 bigger; 1
// spore fewer converts; and nothing can be consumed, food or drug (actions/consume.ts). A Mush carries it without
// suffering any of it.
export const food_poisoning_disease: Modifier = {
  maxHp: (value) => (value - 3 < 0 ? 1 : value - 3),
  maxMorale: (value) => (value - 3 < 0 ? 1 : value - 3),
  damageTaken: (amount) => amount + 1,
  contaminationCapacity: (amount) => (amount - 1 < 1 ? 1 : amount - 1),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
  onEnterRoom(next, player) {
    if (rollFloat(next) < ENTER_VOMIT_CHANCE) vomit(next, player);
  },
};
