import type { Modifier } from "../modifiers.ts";

// Confirmed 2026-10-11: +1 AP per cycle while in a bed. The lie_down action
// adds it; get_up, or any other timed action, removes it (performAction).
export const lying_down: Modifier = { apPerCycle: (gain) => gain + 1 };
