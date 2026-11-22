import { changeAP, updateMaxValues } from "../adjustStats.ts";
import { foaming, vomit } from "../diseases.ts";
import { ITEM_TYPES } from "../items.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Max health lost. */
const MAX_HP_LOSS = 2;
/** AP lost after consuming any item. */
const CONSUME_AP_LOSS = 2;
/** Chance to vomit on entering a room. */
const ENTER_VOMIT_CHANCE = 0.4;

// Liver Dysfunction (owner, 2026-11-22; eMushpedia's "Foie hors d'état"): an action that already costs AP costs 1 more,
// with Burnt Hand's scope (free actions and moves unaffected); -2 max health; consuming any item (food or drug) costs
// 2 AP afterwards; eating food (satiety above 0) makes the player vomit; on every room entered, foaming and a 40% chance
// to vomit.
export const liver_disfunction_injury: Modifier = {
  actionCost: (cost, { action }) => (action.type !== "move" && cost.ap >= 1 ? { ...cost, ap: cost.ap + 1 } : cost),
  maxHp: (value) => Math.max(1, value - MAX_HP_LOSS),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
  onConsume(next, player, item) {
    changeAP(next, player, -CONSUME_AP_LOSS);
    if ((ITEM_TYPES[item.type]?.consume?.satiety ?? 0) > 0) vomit(next, player);
  },
  onEnterRoom(next, player) {
    foaming(next, player);
    if (rollFloat(next) < ENTER_VOMIT_CHANCE) vomit(next, player);
  },
};
