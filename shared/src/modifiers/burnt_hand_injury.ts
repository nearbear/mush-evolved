import { updateMaxValues } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";

/** Max health lost. */
const MAX_HP_LOSS = 1;

/**
 * A burn: actions that already cost AP cost `surcharge` more (free ones, and ones paid by skill points, stay free);
 * moving between rooms is unaffected, as on eMushpedia's Injuries page. -1 max health.
 */
const burn = (surcharge: number): Modifier => ({
  actionCost: (cost, { action }) => (action.type !== "move" && cost.ap >= 1 ? { ...cost, ap: cost.ap + surcharge } : cost),
  maxHp: (value) => Math.max(1, value - MAX_HP_LOSS),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
});

// Burnt Hand (owner, 2026-11-17): +1 AP.
export const burnt_hand_injury: Modifier = burn(1);
// Burned Arm (owner, 2026-11-21; eMushpedia's "Bras brûlés"): Burnt Hand's upgrade (INJURY_UPGRADES, diseases.ts), +2 AP.
export const burned_arm_injury: Modifier = burn(2);
