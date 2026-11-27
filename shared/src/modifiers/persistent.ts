import type { Modifier } from "../modifiers.ts";

// Skill "persistent" (Persevérant), per the owner 2026-10-25: after a miss the chance of the next try grows faster.
// Every action with odds keeps a failure streak (actions/action.ts `chance`); this multiplier replaces the action's own
// (`config.failureMultiplier` or a per-action one) when it is higher.
export const persistent: Modifier = {
  failureStreakMultiplier: (multiplier, _player, state) => Math.max(multiplier, state.config.persistent.failureMultiplier),
};
