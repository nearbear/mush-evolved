// Small helpers shared by rules.ts, chat.ts and the actions.

import type { GameConfig, GameState, PlayerId, PlayerState } from "./types.ts";

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: string };

/** An error code for the client to turn into text. */
export const fail = (code: string): ActionResult => ({ ok: false, error: code });

/** A plain object (not null, not an array), for checking untrusted JSON. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** GameState is plain JSON by design, so a JSON round-trip is a full deep copy. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Deep-copy a GameState while sharing `state.config` by reference.
 * `config` is immutable (DeepReadonly<GameConfig> and frozen at runtime) and must never be mutated.
 */
export function cloneState(state: Readonly<GameState>): GameState {
  const { config, ...rest } = state;
  return { ...clone(rest), config };
}

/** Recursively freeze a plain object/array graph in place (for immutable config). */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const v of Object.values(value)) deepFreeze(v);
  return value;
}

export function findPlayer(state: GameState, id: PlayerId): PlayerState | undefined {
  return state.players.find((p) => p.id === id);
}

/** Day and cycle-within-day (both 1-based) for a global cycle counter. */
export function dayOf(state: { cycle: number; config: Pick<GameConfig, "cyclesPerDay"> }): { day: number; cycleOfDay: number } {
  const n = state.config.cyclesPerDay;
  return { day: Math.floor((state.cycle - 1) / n) + 1, cycleOfDay: ((state.cycle - 1) % n) + 1 };
}
