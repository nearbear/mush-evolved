import type { Modifier } from "../modifiers.ts";

// Confirmed 2026-10-11: +1 AP per cycle while in a bed. Nothing applies it
// yet; a lie-down action will add and remove it.
export const lying_down: Modifier = { apPerCycle: (gain) => gain + 1 };
