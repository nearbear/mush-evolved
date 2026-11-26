import type { Modifier } from "../modifiers.ts";

/** What Depression takes off the AP and morale caps. */
const MAX_LOSS = 2;
// Depression (owner, 2026-11-25): a disorder, so it lasts forever (diseases.ts, `addDisease`). -2 max AP and -2 max
// morale (its extra daily morale loss was removed, owner 2026-11-26). Nothing to a Mush, and nothing while a Shrink's Comfort has it
// calmed (`modifierIds`, `calmDisorder`). The caps are recomputed when it is caught, calmed or acts again.
export const depression_disorder: Modifier = {
  maxAp: (value) => Math.max(1, value - MAX_LOSS),
  maxMorale: (value) => Math.max(1, value - MAX_LOSS),
};
