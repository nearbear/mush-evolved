import { getUp } from "../bed.ts";
import type { Modifier } from "../modifiers.ts";

// Stiff Neck (owner, 2026-11-20): an injury that lasts 4 cycles (its `allDiseaseStats` entry in config.ts) instead of
// lasting until surgery, though surgery still cures it. It can't be shortened otherwise. You can't lie down while you
// have it (lie_down.ts), and getting it gets you out of bed. Not in the random combat injury pool.
export const stiff_neck_injury: Modifier = {
  onPick: (_next, player) => {
    if (player.modifiers.includes("lying_down")) getUp(player);
  },
};
