import type { Modifier } from "../modifiers.ts";

// Skill "maintenance_agent" (owner, 2026-11-14): +1 Engineer, +1 Garden, and +1 Cook point each day and 1 of each
// when picked, held up to the shared caps (config.engineer.capPoints, config.botany.capPoints, config.cook.capPoints).
export const maintenance_agent: Modifier = {
  engineerPointsPerDay: (sum, _player, state) => sum + state.config.maintenanceAgent.pointsPerDay.eng,
  gardenPointsPerDay: (sum, _player, state) => sum + state.config.maintenanceAgent.pointsPerDay.garden,
  cookPointsPerDay: (sum, _player, state) => sum + state.config.maintenanceAgent.pointsPerDay.cook,
  onPick: (next, player) => {
    const { eng, garden, cook } = next.config.maintenanceAgent.pointsOnPick;
    player.resources.eng = Math.min(next.config.engineer.capPoints, player.resources.eng + eng);
    player.resources.garden = Math.min(next.config.botany.capPoints, player.resources.garden + garden);
    player.resources.cook = Math.min(next.config.cook.capPoints, player.resources.cook + cook);
  },
};
