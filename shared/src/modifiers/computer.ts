import type { Modifier } from "../modifiers.ts";

// Skill "computer" (Computer Scientist), per the owner 2026-10-16: 2 Computer points each day and 2 when picked,
// held up to config.computer.capPoints. They pay for research (actions/research.ts). No hacking or NERON bonus.
export const computer: Modifier = {
  computerPointsPerDay: (sum, _player, state) => sum + state.config.computer.pointsPerDay,
  onPick: (next, player) => {
    player.resources.comp = Math.min(next.config.computer.capPoints, player.resources.comp + next.config.computer.pointsPerDay);
  },
};
