import type { Modifier } from "../modifiers.ts";

// Skill "gunman" (Tireur), per the owner 2026-10-25: 2 Shoot points each day and 2 when picked, held up to
// config.gunman.capPoints. A point makes one turret shot free (actions/turret_attack.ts), hit or miss.
// For firearms (`weapon.gun === true`), also doubles critical hit weights and non-fumble miss weights;
// its NERON project bonus is in PROJECTS (projects.ts).
export const gunman: Modifier = {
  shootPointsPerDay: (sum, _player, state) => sum + state.config.gunman.pointsPerDay,
  onPick: (next, player) => {
    player.resources.shoot = Math.min(next.config.gunman.capPoints, player.resources.shoot + next.config.gunman.pointsPerDay);
  },
  weaponOutcomeWeight: (weight, ctx) => {
    if (!ctx.weapon.gun) return weight;
    if (ctx.kind === "hit" && ctx.critical) return weight * 2;
    if (ctx.kind === "miss" && !ctx.fumble) return weight * 2;
    return weight;
  },
};
