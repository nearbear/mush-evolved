import type { Modifier } from "../modifiers.ts";

// Skill "medic" (Doctor), corrected 2026-10-15: heal actions restore 2 more HP. Owner, 2026-11-17: surgery's success chance
// is multiplied by `surgery.medicFactor`, and a medic holding a medikit can operate anywhere (surgery.ts).
export const medic: Modifier = {
  healAmount: (amount, _player, state) => amount + state.config.heal.effect.medicBonusHp,
  actionSucessRate: (chance, { action, state }) => (action.type === "surgery" ? chance * state.config.surgery.medicFactor : chance),
};
