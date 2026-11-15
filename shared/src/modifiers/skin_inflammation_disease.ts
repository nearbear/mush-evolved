import { damage } from "../death.ts";
import { soil } from "../dirt.ts";
import { diseaseAffects, itchy } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Chance to scratch (a public log) on entering a room. */
const ENTER_ITCH_CHANCE = 0.16;
/** Chance to become dirty at each cycle change. */
const CYCLE_DIRT_CHANCE = 0.1;
/** Health lost when showering. */
const SHOWER_DAMAGE = 6;

// Skin inflammation: a 16% chance to scratch (itchy, a special log) on entering a room, a 10% chance to become dirty
// at each cycle change, and -6 health when showering. The numbers are the owner's (2026-11-14); the trigger for the
// itch (entering a room, like gastroenteritis's vomit) and the duration (config.ts) are placeholders.
export const skin_inflammation_disease: Modifier = {
  onEnterRoom(next, player) {
    if (rollFloat(next) < ENTER_ITCH_CHANCE) itchy(next, player);
  },
  onCycle(next, player) {
    if (!diseaseAffects(player)) return;
    if (rollFloat(next) < CYCLE_DIRT_CHANCE) soil(next, player);
  },
  onShower(next, player) {
    if (!diseaseAffects(player)) return;
    damage(next, player, SHOWER_DAMAGE, "injury");
  },
};
