import type { Modifier } from "../modifiers.ts";

// Skill "gunner" (Canonnier), per the owner 2026-10-24 (the wiki agrees with the data's effect, not its "+50%" text):
// doubles both the chance to hit and the damage of the holder's turret shots.
export const gunner: Modifier = {
  actionSucessRate: (chance, { tags, state }) => (tags.includes("shoot") ? chance * state.config.gunner.accuracyFactor : chance),
  turretDamage: (damage, _player, state) => damage * state.config.gunner.damageFactor,
};
