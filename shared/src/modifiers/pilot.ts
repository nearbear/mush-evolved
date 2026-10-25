import type { Modifier } from "../modifiers.ts";

// Skill "pilot" (owner, 2026-10-24, docs/patrol-plan.md): a patrol ship's takeoff and landing are always clean. Only
// Pilots fly for now (patrol.ts, `canFly`). Its doubled shooting odds come with patrol-ship shots (phase 3).
export const pilot: Modifier = {
  cleanManoeuvreChance: () => 1,
};
