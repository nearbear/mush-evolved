import type { Modifier } from "../modifiers.ts";

// Skill "persistent" (Persevérant), per the owner 2026-10-25: after a miss the chance of the next try grows faster.
// The failure streaks are the turret shot's and the astro scan's; the multiplier replaces theirs when it is higher.
export const persistent: Modifier = {
  failureStreakMultiplier: (multiplier, _player, state) => Math.max(multiplier, state.config.persistent.failureMultiplier),
};
