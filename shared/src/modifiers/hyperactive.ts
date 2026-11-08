import type { Modifier } from "../modifiers.ts";

// Chao's Hyperactive trait (owner, 2026-11-08): +1 MP at every cycle change, and the bed's +1 AP per cycle
// (`lying_down.ts`, which checks for this id) never applies to him. Lethargy's lying bonus is a separate hook and unaffected.
export const hyperactive: Modifier = {
  mpPerCycle: (gain) => gain + 1,
};
