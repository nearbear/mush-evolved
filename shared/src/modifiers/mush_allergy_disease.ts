import { killPlayer } from "../death.ts";
import { diseaseAffects } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";

// Mush Allergy (owner, 2026-11-14): lasts 20-32 cycles (config.ts). A human who receives a spore dies, of `injury`
// so the public death line doesn't reveal the spore (owner, 2026-11-14). If that spore converts them, they live.
export const mush_allergy_disease: Modifier = {
  onContaminate(next, player) {
    if (!player.alive || !diseaseAffects(player)) return; // converted (now Mush) or a Mush carrier: no effect
    killPlayer(next, player, "injury");
  },
};
