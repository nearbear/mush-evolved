import type { Modifier } from "../modifiers.ts";

// Skill "medic" (Doctor), corrected 2026-10-15: heal actions restore 2 more HP. Its other perks are not built yet.
export const medic: Modifier = { healAmount: (amount, _player, state) => amount + state.config.heal.effect.medicBonusHp };
