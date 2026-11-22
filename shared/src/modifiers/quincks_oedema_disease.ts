import { updateMaxValues } from "../adjustStats.ts";
import { damage } from "../death.ts";
import { addDisease, diseaseAffects } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";
import { rollInt } from "../rng.ts";

/** Health lost when the disease is caught. */
const CONTRACT_DAMAGE = 6;
/** One of these, with equal odds, when the disease is caught. */
const BURNS = ["burnt_hand_injury", "burned_arm_injury"] as const;

// Quincke's Oedema (owner, 2026-11-21; eMushpedia's "Œdème de Quincke"): lasts 1-3 cycles (config.ts). -4 max health,
// and every room-to-room move costs 1 MP more. When caught: -6 health (death cause `injury`) and Burnt Hand or Burned
// Arm, with equal odds (a Burnt Hand on top of a Burnt Hand upgrades as usual). A Mush carries it without any of it.
export const quincks_oedema_disease: Modifier = {
  maxHp: (value) => Math.max(1, value - 4),
  movement: (rules) => ({ ...rules, mpPerMove: rules.mpPerMove + 1 }),
  onPick(next, player) {
    updateMaxValues(next, player);
    if (!diseaseAffects(player)) return;
    damage(next, player, CONTRACT_DAMAGE, "injury");
    if (player.alive) addDisease(next, player, BURNS[rollInt(next, BURNS.length)]!);
  },
};
