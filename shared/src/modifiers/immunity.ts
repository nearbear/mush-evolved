import type { Modifier } from "../modifiers.ts";

// Chun's Immunity trait (owner, 2026-10-18): infection never touches her. A pure marker with no hooks;
// `isImmune` (statuses.ts) checks for it, so `contaminate` does nothing to the holder. Shown as the public,
// permanent `immunity` status.
export const immunity: Modifier = {};
