import type { Modifier } from "../modifiers.ts";

// Skill "designer" (the original's Conceptor; renamed by the owner, 2026-10-24): 2 Designer points each day and 2 when
// picked, held up to config.designer.capPoints. They pay for NERON projects only (actions/project.ts), unlike the
// more flexible Computer points. Its NERON project bonus is in PROJECTS (projects.ts).
export const designer: Modifier = {
  designerPointsPerDay: (sum, _player, state) => sum + state.config.designer.pointsPerDay,
  onPick: (next, player) => {
    player.resources.core = Math.min(next.config.designer.capPoints, player.resources.core + next.config.designer.pointsPerDay);
  },
};
