import { changeMP, updateMaxValues } from "../adjustStats.ts";
import { damage } from "../death.ts";
import { soil } from "../dirt.ts";
import { diseaseAffects, vomit } from "../diseases.ts";
import { ITEM_TYPES } from "../items.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Chance to lose 1 MP at each cycle change. */
const CYCLE_MP_CHANCE = 0.33;
/** Chance to lose 1 health at each cycle change. */
const CYCLE_DAMAGE_CHANCE = 0.33;
/** Chance to get dirty at each cycle change. */
const CYCLE_DIRTY_CHANCE = 0.4;
/** Chance to vomit on entering a room. */
const ENTER_VOMIT_CHANCE = 0.08;

// Flu (owner, 2026-11-17): lasts 8-12 cycles and spreads by STT/DTT, and with a 2% chance to each other player in the
// room at a cycle change and on an encounter (config.ts, through `spreadAtCycle` and `spreadOnEncounter`). At each cycle change a 33% chance to lose 1 MP,
// a 33% chance to lose 1 health and a 40% chance to get dirty (`soil`); -3 max morale and -3 max health; eating food
// makes the player vomit, and so does entering a room 8% of the time. A Mush spreads it and still vomits (`vomit` keeps
// to special logs) but suffers no stats.
export const flu_disease: Modifier = {
  onCycle(next, player) {
    if (!diseaseAffects(player)) return;
    if (rollFloat(next) < CYCLE_MP_CHANCE && player.mp > 0) changeMP(next, player, -1);
    if (rollFloat(next) < CYCLE_DAMAGE_CHANCE) damage(next, player, 1, "injury");
    if (rollFloat(next) < CYCLE_DIRTY_CHANCE) soil(next, player);
  },
  maxMorale: (value) => (value - 3 < 0 ? 1 : value - 3),
  maxHp: (value) => (value - 3 < 0 ? 1 : value - 3),
  onPick: (next, player) => {
    updateMaxValues(next, player);
  },
  onConsume(next, player, item) {
    // Food only: a drug (satiety 0) is no meal.
    const consume = ITEM_TYPES[item.type]?.consume;
    if (consume && consume.satiety > 0) vomit(next, player);
  },
  onEnterRoom(next, player) {
    if (rollFloat(next) < ENTER_VOMIT_CHANCE) vomit(next, player);
  },
};
