import { gainMorale } from "../adjustStats.ts";
import type { Modifier } from "../modifiers.ts";
import type { GameState, PlayerState } from "../types.ts";

/**
 * Whether the holder's room is crowded: at least `config.agoraphobia.crowd` living crew members (the holder included,
 * Mush too) and hostile NPCs in it.
 */
export function crowded(state: Readonly<GameState>, player: Readonly<PlayerState>): boolean {
  if (!player.alive) return false;
  const crew = state.players.filter((p) => p.alive && p.room === player.room).length;
  // Read off `state.hostiles` directly: importing hostiles.ts here would make a cycle through the modifier registry.
  const hostiles = state.hostiles.filter((h) => h.room === player.room).length;
  return crew + hostiles >= state.config.agoraphobia.crowd;
}

// Agoraphobia (owner, 2026-11-26): a disorder, so it lasts forever and does nothing to a Mush or while calmed
// (`modifierIds`). In a crowded room, actions that already cost AP cost `apSurcharge` more (free ones, and ones paid by
// skill points, stay free), a move out of it costs `mpSurcharge` more MP (the room being left counts), and each cycle
// change spent in one costs `moraleLoss` morale.
export const agoraphobia_disorder: Modifier = {
  actionCost: (cost, { state, actor, action }) =>
    action.type !== "move" && cost.ap >= 1 && crowded(state, actor) ? { ...cost, ap: cost.ap + state.config.agoraphobia.apSurcharge } : cost,
  movement: (rules, player, state) => (crowded(state, player) ? { ...rules, mpPerMove: rules.mpPerMove + state.config.agoraphobia.mpSurcharge } : rules),
  onCycle(next, player) {
    if (crowded(next, player)) gainMorale(next, player, -next.config.agoraphobia.moraleLoss, "agoraphobiaMoraleLoss");
  },
};
