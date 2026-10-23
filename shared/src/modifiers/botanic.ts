import type { Modifier } from "../modifiers.ts";

// Skill "botanic" (Botanist), per the owner 2026-10-22: 2 garden points at the start of each day, held up to
// config.botany.capPoints (the original's +2 a day, max 4). A point pays for watering, treating or sowing a plant in
// the garden (botany.ts). Seeing plant sickness is `isBotanistRole`, shared with the Skilful, who get no points.
export const botanic: Modifier = {
  gardenPointsPerDay: (sum, _player, state) => sum + state.config.botany.pointsPerDay,
};
