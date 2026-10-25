import { logPrivate } from "../log.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

// Skill, confirmed 2026-10-15: a failed action that cost AP has a 50% chance
// to give 1 AP back. It can't pass the AP cap, since the AP was just spent.
export const creative: Modifier = {
  onActionFailed(next, player, apSpent) {
    if (apSpent <= 0) return;
    if (rollFloat(next) >= next.config.creative.refundOdds) return;
    player.ap += 1;
    logPrivate(next, player.id, "creativeRefund");
  },
};
