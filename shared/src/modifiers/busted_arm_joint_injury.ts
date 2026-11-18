import { updateMaxValues } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";
import { isShot } from "./shots.ts";

/** Extra AP on every action that already costs AP. */
const AP_SURCHARGE = 2;
/** Max health lost. */
const MAX_HP_LOSS = 4;
/** Success chance kept on a shot: a fifth off, relative. */
const SHOT_SUCCESS_FACTOR = 0.8;

// Busted Arm Joint (owner, 2026-11-18; eMushpedia Blessures): actions that already cost AP cost 2 more (free ones, ones
// paid by skill points, and moving between rooms are unaffected, as for Burnt Hand), -4 max health, and every shot's
// success chance is multiplied by 0.8 (the same shots as Pink Eye: `isShot`, shots.ts).
export const busted_arm_joint_injury: Modifier = {
  actionCost: (cost, { action }) => (action.type !== "move" && cost.ap >= 1 ? { ...cost, ap: cost.ap + AP_SURCHARGE } : cost),
  actionSucessRate: (chance, { action, tags }) => (isShot(action, tags) ? chance * SHOT_SUCCESS_FACTOR : chance),
  maxHp: (value) => Math.max(1, value - MAX_HP_LOSS),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
};
