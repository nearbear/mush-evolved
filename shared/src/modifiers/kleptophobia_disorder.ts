import { gainMorale } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";

// Kleptophobia (owner, 2026-11-26): a disorder, so it lasts forever and does nothing to a Mush or while calmed
// (`modifierIds`). Dropping an item costs `dropAp` AP (its base price, so Agoraphobia's surcharge adds to it), and an
// item the holder carried that an expedition loses ("stolen") costs them `moraleLoss` morale.
export const kleptophobia_disorder: Modifier = {
  dropAp: (value, _player, state) => value + state.config.kleptophobia.dropAp,
  onItemLost(next, player) {
    gainMorale(next, player, -next.config.kleptophobia.moraleLoss, "kleptophobiaMoraleLoss");
  },
};
