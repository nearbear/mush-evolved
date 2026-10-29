import type { Modifier } from "../modifiers.ts";

// Skill "engineer" (owner, 2026-10-28, docs/patrol-plan.md phase 6): a patrol ship's renovation is
// `patrol.renovate.engineerFactor` times as likely to work (eMush's x2). Its PILGRED repair bonus is in pilgred.ts and its
// NERON project bonus in PROJECTS (projects.ts).
export const engineer: Modifier = {
  actionSucessRate: (chance, { action, state }) => (action.type === "renovate" ? chance * state.config.patrol.renovate.engineerFactor : chance),
};
