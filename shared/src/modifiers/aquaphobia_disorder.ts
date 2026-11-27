import { gainMorale } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";

// Aquaphobia (owner, 2026-11-27): a disorder, so it lasts forever and does nothing to a Mush or while calmed
// (`modifierIds`). A shower costs `apSurcharge` more AP (after soap's and Water Resistant's discounts), costs
// `moraleLoss` morale, and can be taken only once a day: any shower that day counts, even one taken before the
// disorder or while it was calmed (`PlayerState.showeredToday`, actions/shower.ts).
export const aquaphobia_disorder: Modifier = {
  actionCost: (cost, { state, action }) => (action.type === "shower" ? { ...cost, ap: cost.ap + state.config.aquaphobia.apSurcharge } : cost),
  onShower(next, player) {
    gainMorale(next, player, -next.config.aquaphobia.moraleLoss, "aquaphobiaMoraleLoss");
  },
  oneShowerADay: true,
};
