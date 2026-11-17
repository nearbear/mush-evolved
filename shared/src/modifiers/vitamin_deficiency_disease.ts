import { weakness } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Success chance kept on any action with a roll: 15% off, relative. */
const SUCCESS_FACTOR = 0.85;
/** Chance of the weakness log after a failed action. */
const WEAKNESS_CHANCE = 0.25;

// Vitamin Deficiency (owner, 2026-11-17): lasts 12-20 cycles (config.ts). Every action's success chance is multiplied
// by 0.85, and a failed action has a 25% chance to log weakness ("doesn't seem very energetic") in the room. Both
// hooks go through `modifierIds`, which leaves out a Mush's diseases, so a Mush carries it without effect.
export const vitamin_deficiency_disease: Modifier = {
  actionSucessRate: (chance) => chance * SUCCESS_FACTOR,
  onActionFailed(next, player) {
    if (rollFloat(next) < WEAKNESS_CHANCE) weakness(next, player);
  },
};
