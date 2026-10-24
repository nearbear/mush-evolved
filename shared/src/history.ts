// ---- Action history ----------------------------------------------------------
// Every body keeps its last few actions (owner, 2026-10-24), for the skills that reveal them: the Torturer's
// Interrogate and the Confident's Chitchat. Only the action's name is kept and revealed (its button, as in eMush),
// never its target, outcome or cycle. Failed actions count; the few an action marks `recorded = false` (moving,
// taking and dropping, Examine, BIOS changes) don't. The history belongs to the body, so it stays put in a Transfer.

import { logPrivate } from "./log.ts";
import type { GameState, PlayerState } from "./types.ts";

/** How many actions a body remembers: no reveal can ask for more than max HP (Interrogate) or max morale (Chitchat). */
export const historyLength = (state: Readonly<GameState>): number => Math.max(state.config.maxHp, state.config.maxMorale);

/** Adds an action to the body's history, dropping the oldest past the cap. Mutates a state the caller already cloned. */
export function recordAction(state: GameState, body: PlayerState, type: string): void {
  body.history.push(type);
  const excess = body.history.length - historyLength(state);
  if (excess > 0) body.history.splice(0, excess);
}

/**
 * Shows `viewer` the last `count` actions of `subject`'s body, newest first, as private log lines (or one line
 * saying there was nothing). Mutates a state the caller already cloned.
 */
export function revealHistory(state: GameState, viewer: PlayerState, subject: Readonly<PlayerState>, count: number): void {
  const shown = count > 0 ? subject.history.slice(-count).reverse() : [];
  if (shown.length === 0) {
    logPrivate(state, viewer.id, "historyNothing", { name: subject.character });
    return;
  }
  for (const action of shown) logPrivate(state, viewer.id, "historyRevealed", { name: subject.character, action });
}
