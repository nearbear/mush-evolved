import { damage } from "../death.ts";
import { bite, diseaseAffects, foaming } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";
import { rollFloat } from "../rng.ts";

/** Health lost at each cycle change. */
const CYCLE_DAMAGE = 2;
/** Chance to foam from the mouth on entering a room. */
const ENTER_FOAM_CHANCE = 0.16;
/** Chance to attack someone with a carried weapon on entering a room. */
const ENTER_ATTACK_CHANCE = 0.16;

// Space rabies: -2 health at each cycle change (and a bite, a special log whose victim loses 2 health); on entering a
// room a 16% chance to foam and a 16% chance to attack another player with a weapon they carry; every loss of health
// is 1 bigger (`damageTaken`, which also makes the cycle's own 2 into 3). The numbers are the owner's (2026-11-14);
// "attack players with a held weapon" is read as the carrier striking someone with their own weapon.
export const space_rabies_disease: Modifier = {
  onCycle(next, player) {
    if (diseaseAffects(player)) damage(next, player, CYCLE_DAMAGE, "injury");
    bite(next, player);
  },
  onEnterRoom(next, player, tools) {
    if (rollFloat(next) < ENTER_FOAM_CHANCE) foaming(next, player);
    // Only someone it affects turns violent; a Mush with bacterial_contact just fakes the log.
    if (diseaseAffects(player) && rollFloat(next) < ENTER_ATTACK_CHANCE) tools.attackWithHeldWeapon(next, player);
  },
  damageTaken: (amount) => amount + 1,
};
