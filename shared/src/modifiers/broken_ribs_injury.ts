import type { Modifier } from "../modifiers.ts";

// Broken Ribs (owner, 2026-11-22; eMushpedia's "Côtes pétées"): an action that already costs AP costs 1 more, with
// Burnt Hand's scope (free actions and moves unaffected), and every room-to-room move costs 1 MP more.
export const broken_ribs_injury: Modifier = {
  actionCost: (cost, { action }) => (action.type !== "move" && cost.ap >= 1 ? { ...cost, ap: cost.ap + 1 } : cost),
  movement: (rules) => ({ ...rules, mpPerMove: rules.mpPerMove + 1 }),
};
