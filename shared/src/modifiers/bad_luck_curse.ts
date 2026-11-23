import type { Modifier } from "../modifiers.ts";

// Bad Luck (owner, 2026-11-22), a curse from the Mush skill Nightmarish (actions/nightmare.ts): 8-16 cycles (config.ts).
// Every action's random injury and dirt chances are multiplied by `badLuckCurse.injuryFactor` and `dirtFactor` (4), and
// the Metal Plate and Tremor incidents always deal the top of their damage range (`worstDamage`, `incidentDamage`).
// Hidden from the holder (curses.ts). Like a disease, it does nothing to a Mush (`modifierIds`).
export const bad_luck_curse: Modifier = {
  actionInjuryRate: (chance, { state }) => chance * state.config.badLuckCurse.injuryFactor,
  actionDirtRate: (chance, { state }) => chance * state.config.badLuckCurse.dirtFactor,
  worstDamage: true,
};
