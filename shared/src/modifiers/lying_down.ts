import { peopleHere } from "../actions/action.ts";
import { gainMorale } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";
import { hasSkill } from "../skills.ts";

// Confirmed 2026-10-11: +1 AP per cycle while in a bed. The lie_down action
// adds it; get_up, or any other timed action, removes it (performAction).
// Shrink (owner, 2026-10-26): +`shrink.lyingMorale` morale per cycle while a living
// Shrink other than yourself is in your room; several Shrinks don't stack. No log line.
export const lying_down: Modifier = {
  apPerCycle: (gain) => gain + 1,
  onCycle(next, player) {
    if (peopleHere(next, player).some((o) => hasSkill(o, "shrink"))) gainMorale(next, player, next.config.shrink.lyingMorale);
  },
};
