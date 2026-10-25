import type { Modifier } from "../modifiers.ts";

// Skill "polymath" (Polymathe), per the owner 2026-10-25: 2 more private channels, 1 Computer point a day (and 1 when
// picked, as the Computer Scientist's) and room for 2 more. The original's -10% on every action attempt is not built.
export const polymath: Modifier = {
  channelLimit: (limit, _player, state) => limit + state.config.polymath.channels,
  computerPointsPerDay: (sum, _player, state) => sum + state.config.polymath.computerPointsPerDay,
  computerPointsCap: (cap, _player, state) => cap + state.config.polymath.computerCapBonus,
  // Runs once the skill is in the holder's list, so their cap already includes the bonus.
  onPick: (next, player) => {
    const cap = next.config.computer.capPoints + next.config.polymath.computerCapBonus;
    player.resources.comp = Math.min(cap, player.resources.comp + next.config.polymath.computerPointsPerDay);
  },
};
