import type { Modifier } from "../modifiers.ts";

// Bodyguard (owner, 2026-11-14): while the bodyguard and their VIP are both alive in the same room,
// every aggressive action targeting the VIP costs +2 AP, including by the bodyguard themselves.
export const bodyguard: Modifier = {
  roomActionCost: (cost, { state, action, tags, holder }) => {
    if (!tags.includes("aggressive")) return cost;
    const target = (action as { target?: unknown }).target;
    if (typeof target !== "string") return cost;
    const vip = state.players.find((p) => p.id === target);
    if (!vip || !vip.alive || vip.room !== holder.room || vip.protectedBy !== holder.id) return cost;
    return { ...cost, ap: cost.ap + state.config.bodyguard.aggressiveApSurcharge };
  },
};
