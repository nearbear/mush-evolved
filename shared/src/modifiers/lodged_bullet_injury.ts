import { updateMaxValues } from "../adjustStats.ts";
import { foaming } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";

/** Max health lost. */
const MAX_HP_LOSS = 2;

// Lodged Bullet (owner, 2026-11-22; eMushpedia's "Balle en balade"): an action that already costs AP costs 1 more, with
// Burnt Hand's scope (free actions and moves unaffected); -2 max health; foams from the mouth on every room entered
// (`onEnterRoom`, as Space Rabies' foam, without its chance). In `config.diseases.bulletInjuries`.
export const lodged_bullet_injury: Modifier = {
  actionCost: (cost, { action }) => (action.type !== "move" && cost.ap >= 1 ? { ...cost, ap: cost.ap + 1 } : cost),
  maxHp: (value) => Math.max(1, value - MAX_HP_LOSS),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
  onEnterRoom: (next, player) => foaming(next, player),
};
