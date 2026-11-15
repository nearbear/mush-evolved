import type { Modifier } from "../modifiers.ts";

// Skill "cook" (Chef), owner 2026-11-14: 4 Cook points each day and 4 when picked, held up to config.cook.capPoints (8).
// A Cook point makes one `cook` action free (actions/cook.ts). Fruit lore (FRUIT_LORE_SKILLS in fruits.ts) and the
// FOOD_RETAILER NERON project bonus (projects.ts) are already wired.
export const cook: Modifier = {
  cookPointsPerDay: (sum, _player, state) => sum + state.config.cook.pointsPerDay,
  onPick: (next, player) => {
    player.resources.cook = Math.min(next.config.cook.capPoints, player.resources.cook + next.config.cook.pointsOnPick);
  },
};
