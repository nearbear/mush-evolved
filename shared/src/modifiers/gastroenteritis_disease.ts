import { changeAP, changeMP, updateMaxValues } from "../adjustStats.ts";
import { damage } from "../death.ts";
import { soil } from "../dirt.ts";
import { diseaseAffects, vomit } from "../diseases.ts";
import { ITEM_TYPES } from "../itemTypes.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Chance to lose 1 health at each cycle change. */
const CYCLE_DAMAGE_CHANCE = 0.3;
/** Chance to vomit on entering a room. */
const ENTER_VOMIT_CHANCE = 0.16;

// Gastroenteris: -1 MP, a 30% chance to lose 1 health and a dirty player at each cycle change; -2 max morale; eating
// food makes the player vomit, and so does entering a room 16% of the time; a Pilot can't fly (patrol.ts, `canFly`).
// The numbers are the owner's (2026-11-14); its duration (config.ts) is a placeholder, the same as the fungal infection's.
export const gastroenteritis_disease: Modifier = {
  onCycle(next, player) {
    if (!diseaseAffects(player)) return;
    changeMP(next, player, -1);
    if (rollFloat(next) < CYCLE_DAMAGE_CHANCE) damage(next, player, 1, "injury");
    soil(next, player, { superDirty: true });
  },
  maxMorale: (value) => (value - 2 < 0 ? 1 : value - 2),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
  onConsume(next, player, item) {
    // -1 AP on anything consumed, after the item's own AP; a Mush's meal has none (consume.ts) and suffers no stats.
    if (diseaseAffects(player)) changeAP(next, player, -1);
    const consume = ITEM_TYPES[item.type]?.consume;
    // Food only: a drug (satiety 0) is no meal.
    if (consume && consume.satiety > 0) vomit(next, player);
  },
  onEnterRoom(next, player) {
    if (rollFloat(next) < ENTER_VOMIT_CHANCE) vomit(next, player);
  },
};
