import type { Modifier } from "../modifiers.ts";

// Skill "wrestler" (owner, 2026-11-26): +2 punch damage (`punch.effect.wrestlerBonusDamage`), punches only, not stacking
// with Solid (`sturdy` adds nothing for a Wrestler). Its Throw Out action is actions/throw_out.ts.
export const wrestler: Modifier = {
  punchDamage: (damage, _player, state) => damage + state.config.punch.effect.wrestlerBonusDamage,
};
