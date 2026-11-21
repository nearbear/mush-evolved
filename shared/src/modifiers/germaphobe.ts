import type { Modifier } from "../modifiers.ts";
import { gainMorale } from "../adjustStats.ts";

// Finola's Germaphobe trait (owner, 2026-11-21): at each cycle change she loses `config.germaphobe.moraleLoss`
// morale if she is `dirty`, Mush or human. Runs in `cycleChanged`, after `hopelessCycle`, so reaching 0 this way
// still leaves her a cycle to recover. Shown as the public, permanent `germaphobe` trait status (statuses.ts).
export const germaphobe: Modifier = {
  onCycle(next, player) {
    if (player.statuses.includes("dirty")) gainMorale(next, player, -next.config.germaphobe.moraleLoss, "germaphobeMoraleLoss");
  },
};
