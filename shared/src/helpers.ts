// Small helpers shared by rules.ts and chat.ts.

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
