import type { Modifier } from "../modifiers.ts";

// Mush skill "sapper", Saboteur (owner, 2026-11-07, eMushpedia "Saboteur"): the success chance of Sabotage, equipment and items
// alike, is `sabotage.sapperFactor` times as high (3; the engine caps a chance at 0.99). Its Contaminate action is actions/contaminate.ts.
export const sapper: Modifier = {
  actionSucessRate: (chance, { action, state }) => (action.type === "sabotage" ? chance * state.config.sabotage.sapperFactor : chance),
};
