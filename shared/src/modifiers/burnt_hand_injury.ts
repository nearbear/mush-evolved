import { updateMaxValues } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";

/** Extra AP on every action that already costs AP. */
const AP_SURCHARGE = 1;
/** Max health lost. */
const MAX_HP_LOSS = 1;

// Burnt Hand (owner, 2026-11-17): actions that already cost AP cost 1 more (free ones, and ones paid by skill points,
// stay free); moving between rooms is unaffected, as on eMushpedia's Injuries page. -1 max health.
export const burnt_hand_injury: Modifier = {
  actionCost: (cost, { action }) => (action.type !== "move" && cost.ap >= 1 ? { ...cost, ap: cost.ap + AP_SURCHARGE } : cost),
  maxHp: (value) => Math.max(1, value - MAX_HP_LOSS),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
};
