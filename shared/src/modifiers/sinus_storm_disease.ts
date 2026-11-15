import { changeMP } from "../adjustStats.ts";
import { damage } from "../death.ts";
import { diseaseAffects, sneeze } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Chance to lose 1 MP at each cycle change. */
const CYCLE_MP_CHANCE = 0.3;
/** Chance to lose 1 health at each cycle change. */
const CYCLE_DAMAGE_CHANCE = 0.5;
/** Chance to sneeze (a public line) on entering a room. */
const ENTER_SNEEZE_CHANCE = 0.16;
/** Success chance kept on a patrol ship's shot: 30% off, relative. */
const PILOT_SHOT_FACTOR = 0.7;

// Sinus Storm (owner, 2026-11-15): lasts 8-12 cycles (config.ts). At each cycle change a 30% chance to lose 1 MP and a
// 50% chance to lose 1 health (`damage`, so it can kill); a 16% chance to sneeze on entering a room (special logs); a
// patrol ship's shot succeeds ×0.7 (relative, like Pink Eye). The fold never reaches a Mush's diseases.
export const sinus_storm_disease: Modifier = {
  onCycle(next, player) {
    if (!diseaseAffects(player)) return;
    if (rollFloat(next) < CYCLE_MP_CHANCE && player.mp > 0) changeMP(next, player, -1);
    if (rollFloat(next) < CYCLE_DAMAGE_CHANCE) damage(next, player, 1, "injury");
  },
  onEnterRoom(next, player) {
    if (rollFloat(next) < ENTER_SNEEZE_CHANCE) sneeze(next, player);
  },
  actionSucessRate: (chance, { action }) => (action.type === "patrol_attack" ? chance * PILOT_SHOT_FACTOR : chance),
};
