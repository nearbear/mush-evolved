import type { Modifier } from "../modifiers.ts";
import { hasSkill } from "../skills.ts";

// Skill "sturdy" (Solid), confirmed 2026-10-16: no heavy-item penalty, +1 punch damage (punches only), which a Wrestler
// doesn't add to their own +2 (owner, 2026-11-26). Its Throw Out action is actions/throw_out.ts (owner, 2026-11-15).
export const sturdy: Modifier = {
  heavyMpPenalty: () => 0,
  punchDamage: (damage, player, state) => (hasSkill(player, "wrestler") ? damage : damage + state.config.punch.effect.sturdyBonusDamage),
};
