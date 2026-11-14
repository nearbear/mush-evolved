import type { Modifier } from "../modifiers.ts";

// Observant (owner, 2026-11-14; eMushpedia Observateur): Search costs `observant.searchApDiscount` AP less, never below 0.
// Its other half, a chance to reveal covert actions done in the holder's room, is in `logCovert` (log.ts), since it
// acts on someone else's action rather than the holder's own.
export const observant: Modifier = {
  actionCost: (cost, { action, state }) =>
    action.type === "search" ? { ...cost, ap: Math.max(0, cost.ap - state.config.observant.searchApDiscount) } : cost,
};
