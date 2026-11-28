import { gainMorale } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";

// Kinesiophobia (owner, 2026-11-28): a disorder, so it lasts forever and does nothing to a Mush or while calmed
// (`modifierIds`). Each conversion of AP into MP (a move that has to convert, actions/move.ts) costs `moraleLoss` morale.
export const kinesiophobia_disorder: Modifier = {
  onConvert(next, player) {
    gainMorale(next, player, -next.config.kinesiophobia.moraleLoss, "kinesiophobiaMoraleLoss");
  },
};
