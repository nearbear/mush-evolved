import type { Modifier } from "../modifiers.ts";

// Skill "engineer" (owner, 2026-10-28, docs/plans/archive/patrol.md phase 6): a patrol ship's renovation is
// `patrol.renovate.engineerFactor` times as likely to work (eMush's x2). Its PILGRED repair bonus is in pilgred.ts and its
// NERON project bonus in PROJECTS (projects.ts). Owner, 2026-11-09: 1 Engineer point a day and 2 when picked, held up to
// config.engineer.capPoints; they pay for repair, dismantle, reinforce, hull repair, install, uninstall and renovate.
export const engineer: Modifier = {
  engineerPointsPerDay: (sum, _player, state) => sum + state.config.engineer.pointsPerDay,
  onPick: (next, player) => {
    player.resources.eng = Math.min(next.config.engineer.capPoints, player.resources.eng + next.config.engineer.pointsOnPick);
  },
  actionSucessRate: (chance, { action, state }) =>
    action.type === "renovate" ? chance * state.config.patrol.renovate.engineerFactor : action.type === "repair" ? chance * state.config.repair.engineerFactor : chance,
};
