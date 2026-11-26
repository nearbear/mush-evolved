import type { Modifier } from "../modifiers.ts";

/** What Depression takes off the AP and morale caps. */
const MAX_LOSS = 2;
/** Extra morale lost when a day ends. */
const EXTRA_DAILY_MORALE_LOSS = 1;

// Depression (owner, 2026-11-25): a disorder, so it lasts forever (diseases.ts, `addDisease`). -2 max AP, -2 max
// morale, and 1 more morale lost at each day's end. Nothing to a Mush, and nothing while a Shrink's Comfort has it
// calmed (`modifierIds`, `calmDisorder`). The caps are recomputed when it is caught, calmed or acts again.
export const depression_disorder: Modifier = {
  maxAp: (value) => Math.max(1, value - MAX_LOSS),
  maxMorale: (value) => Math.max(1, value - MAX_LOSS),
  ownMoraleLoss: (loss) => loss + EXTRA_DAILY_MORALE_LOSS,
};
