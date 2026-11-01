import { updateMaxValues } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";

// Skill "lethargy" (owner, 2026-11-01): the AP cap is multiplied by
// `lethargy.maxApMultiplier` (24). From the `cyclesLying`th cycle change spent lying down on, each one gives
// `bonusAp` on top of the bed's (owner's flow: lying down at 0 AP gives 2, 4, 6, then 9, 12, ...).
// Getting up for any reason clears `lyingSince` (getUp), so the count restarts. Kept on becoming Mush, like every skill.
export const lethargy: Modifier = {
  maxAp: (base, _player, state) => base * state.config.lethargy.maxApMultiplier,
  // The refill runs after `state.cycle` has advanced, so the Nth cycle change spent lying down sees `cycle - lyingSince === N`.
  apPerCycle: (gain, player, state) =>
    player.lyingSince !== undefined && state.cycle - player.lyingSince >= state.config.lethargy.cyclesLying ? gain + state.config.lethargy.bonusAp : gain,
  onPick(next, player) {
    updateMaxValues(next, player);
  },
};
