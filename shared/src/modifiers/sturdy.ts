import type { Modifier } from "../modifiers.ts";

// Skill "sturdy" (Solid), confirmed 2026-10-16: no heavy-item penalty, +1 punch damage. Throw Out a crewmate is not built.
export const sturdy: Modifier = {
  heavyMpPenalty: () => 0,
  punchDamage: (damage, _player, state) => damage + state.config.punch.sturdyBonus,
};
