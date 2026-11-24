import type { Modifier } from "../modifiers.ts";

// Skill "devoted" (Devotion; owner, 2026-11-23): +3 AP when given a Commander mission, capped at maxAp.
export const devoted: Modifier = {
  missionAp: (amount, _player, state) => amount + state.config.commanderMission.devotedBonusAp,
};
