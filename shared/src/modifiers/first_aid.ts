import type { Modifier } from "../modifiers.ts";
import { careSkill } from "./careSkill.ts";

// Skill "first_aid" (Nurse), per the owner 2026-10-15: 2 care points each day and 2 when picked. Owner, 2026-11-17: surgery's
// success chance is multiplied by `surgery.nurseFactor`.
export const first_aid: Modifier = {
  ...careSkill("nursePointsPerDay"),
  actionSucessRate: (chance, { action, state }) => (action.type === "surgery" ? chance * state.config.surgery.nurseFactor : chance),
};
