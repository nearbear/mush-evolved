import type { Modifier } from "../modifiers.ts";

// Skill "physicist", per the owner 2026-10-21: 1 PILGRED point at the start of each day, held up to config.pilgred.capPoints
// (the original's IncrPAPerDay(PILGRED, 1) and IncrMaxPA(PILGRED, 2)). A point pays for one PILGRED repair
// (actions/repair_pilgred.ts). The repair bonus itself is in pilgred.ts; no NERON project bonus.
export const physicist: Modifier = {
  pilgredPointsPerDay: (sum, _player, state) => sum + state.config.pilgred.pointsPerDay,
};
