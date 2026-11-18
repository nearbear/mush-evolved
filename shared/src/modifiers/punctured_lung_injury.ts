import { updateMaxValues } from "../adjustStats.ts";
import { damage } from "../death.ts";
import type { Modifier } from "../modifiers.ts";

/** Extra AP on every action that already costs AP. */
const AP_SURCHARGE = 2;
/** Max health lost. */
const MAX_HP_LOSS = 2;
/** Health lost at each cycle change. */
const CYCLE_DAMAGE = 2;

// Punctured Lung (owner, 2026-11-18; eMushpedia Blessures): actions that already cost AP cost 2 more (as for Burnt
// Hand: not free ones, skill-point ones or moves), -2 max health, -2 health at each cycle change (death from it is
// `injury`), and mute (`mute`, as Torn Tongue: no `talking` action, chat post or new private channel).
export const punctured_lung_injury: Modifier = {
  mute: true,
  actionCost: (cost, { action }) => (action.type !== "move" && cost.ap >= 1 ? { ...cost, ap: cost.ap + AP_SURCHARGE } : cost),
  maxHp: (value) => Math.max(1, value - MAX_HP_LOSS),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
  onCycle: (next, player) => damage(next, player, CYCLE_DAMAGE, "injury"),
};
