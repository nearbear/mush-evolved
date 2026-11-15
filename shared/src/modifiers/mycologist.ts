import { removeContamination } from "../infection.ts";
import type { Modifier } from "../modifiers.ts";

/**
 * Skill "mycologist" (confirmed 2026-11-14): each heal or bandage by a human Mycologist removes
 * `heal.effect.mycologistSpores` (1) contamination from a living human patient, silently.
 */
export const mycologist: Modifier = {
  onHeal(next, player, patient) {
    if (player.role !== "human") return;
    removeContamination(next, patient, next.config.heal.effect.mycologistSpores);
  },
};
