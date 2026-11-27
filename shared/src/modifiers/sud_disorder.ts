import { calmDisorderFor } from "../diseases.ts";
import type { Modifier } from "../modifiers.ts";

// Addiction, `sud_disorder` (owner, 2026-11-27): a disorder, so it lasts forever and does nothing to a Mush or while calmed
// (`modifierIds`). -`maxMoraleLoss` max morale; every action's success chance x`successFactor` and its injury and dirt
// chances x`injuryFactor`/`dirtFactor` (relative, capped at 1); every morale loss is `extraMoraleLoss` bigger
// (`moraleLoss`, adjustStats.ts `gainMorale`). Taking a drug calms it for `drugPauseCycles` cycles, like a Shrink's
// Comfort, before the drug's own effects, so a bad drug's morale loss isn't raised (owner, 2026-11-27); a drug taken
// while it is already calmed does nothing (onDrug only runs while it acts).
export const sud_disorder: Modifier = {
  maxMorale: (value, _player, state) => Math.max(1, value - state.config.sud.maxMoraleLoss),
  actionSucessRate: (chance, { state }) => chance * state.config.sud.successFactor,
  actionInjuryRate: (chance, { state }) => Math.min(1, chance * state.config.sud.injuryFactor),
  actionDirtRate: (chance, { state }) => Math.min(1, chance * state.config.sud.dirtFactor),
  moraleLoss: (loss, _player, state) => loss + state.config.sud.extraMoraleLoss,
  onDrug(next, player) {
    calmDisorderFor(next, player, "sud_disorder", next.config.sud.drugPauseCycles);
  },
};
