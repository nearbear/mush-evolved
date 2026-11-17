import type { Modifier } from "../modifiers.ts";

// Skill "computer" (Computer Scientist), per the owner 2026-10-16: 2 Computer points each day and 2 when picked,
// held up to config.computer.capPoints. They pay for research (actions/research.ts), NERON projects
// (actions/project.ts, owner 2026-10-18), comms, planet analysis, and hack (actions/hack.ts); also doubles hack odds.
export const computer: Modifier = {
  computerPointsPerDay: (sum, _player, state) => sum + state.config.computer.pointsPerDay,
  onPick: (next, player) => {
    player.resources.comp = Math.min(next.config.computer.capPoints, player.resources.comp + next.config.computer.pointsPerDay);
  },
  actionSucessRate: (chance, { action, state }) => (action.type === "hack" ? chance * state.config.hack.computerFactor : chance),
};
