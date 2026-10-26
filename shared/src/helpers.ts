// Small helpers shared by rules.ts, chat.ts and the actions.

import type { GameState, PlayerId, PlayerState } from "./types.ts";

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: string };

/** An error code for the client to turn into text. */
export const fail = (code: string): ActionResult => ({ ok: false, error: code });

/** GameState is plain JSON by design, so a JSON round-trip is a full deep copy. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function findPlayer(state: GameState, id: PlayerId): PlayerState | undefined {
  return state.players.find((p) => p.id === id);
}

/** Day and cycle-within-day (both 1-based) for the state's global cycle counter. */
export function dayOf(state: Pick<GameState, "cycle" | "config">): { day: number; cycleOfDay: number } {
  const n = state.config.cyclesPerDay;
  return { day: Math.floor((state.cycle - 1) / n) + 1, cycleOfDay: ((state.cycle - 1) % n) + 1 };
}
