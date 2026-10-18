import type { Modifier } from "../modifiers.ts";

// Ian's Pacifist (owner, 2026-10-18): every aggressive action in his room costs 2 more AP, his own included.
// Stacks if more than one holder is in the room. Kept when he is converted (losing it would out him). Private
// for now: it is a modifier, not a status, until the UI shows it.
export const pacifist: Modifier = {
  roomActionCost: (cost, { tags, state }) => (tags.includes("aggressive") ? { ...cost, ap: cost.ap + state.config.pacifist.aggressiveApSurcharge } : cost),
};
