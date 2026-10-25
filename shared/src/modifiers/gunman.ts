import type { Modifier } from "../modifiers.ts";

// Skill "gunman" (Tireur), per the owner 2026-10-25: 2 Shoot points each day and 2 when picked, held up to
// config.gunman.capPoints. A point makes one turret shot free (actions/turret_attack.ts), hit or miss. The original's
// fewer clumsy misses and more critical hits have no equivalent on shots, and there is no NERON project bonus.
export const gunman: Modifier = {
  shootPointsPerDay: (sum, _player, state) => sum + state.config.gunman.pointsPerDay,
  onPick: (next, player) => {
    player.resources.shoot = Math.min(next.config.gunman.capPoints, player.resources.shoot + next.config.gunman.pointsPerDay);
  },
};
