import type { Modifier } from "../modifiers.ts";

// Skill "pilot" (owner, 2026-10-24, docs/plans/patrol.md): a patrol ship's takeoff and landing are always clean, and a
// shot from a patrol ship is `patrol.shot.pilotAccuracyFactor` times as likely to hit. Only Pilots fly for now
// (patrol.ts, `canFly`).
export const pilot: Modifier = {
  cleanManoeuvreChance: () => 1,
  actionSucessRate: (chance, { action, state }) => (action.type === "patrol_attack" ? chance * state.config.patrol.shot.pilotAccuracyFactor : chance),
};
