// ---- Room log -------------------------------------------------------------
// Three kinds of entry (rules from 2026-10-11; secret handling will change):
//   public:  part of the room's history; anyone in the room sees it, then or later.
//   private: only the actor ever sees it.
//   secret:  becomes room history only if someone else was there to witness it;
//            otherwise only the actor sees it.

import type { GameState, LogEntry, LogParams, PlayerId, RoomId } from "./types.ts";

/** Mutates a state that the caller already cloned. */
export function logPublic(state: GameState, room: RoomId | undefined, key: string, params?: LogParams): void {
  state.log.push({ cycle: state.cycle, key, ...(params && { params }), ...(room !== undefined && { room }), visibleTo: "all" });
}

/** Mutates a state that the caller already cloned. */
export function logPrivate(state: GameState, actor: PlayerId, key: string, params?: LogParams): void {
  const p = state.players.find((pl) => pl.id === actor);
  state.log.push({ cycle: state.cycle, key, ...(params && { params }), ...(p && { room: p.room }), visibleTo: [actor] });
}

/**
 * Mutates a state that the caller already cloned. `hideFrom` is someone who must
 * not see the entry even if present (a spike's victim): when it is set and there
 * are witnesses, the entry goes to the actor and those witnesses only.
 */
export function logSecret(state: GameState, actor: PlayerId, key: string, params?: LogParams, hideFrom?: PlayerId): void {
  const p = state.players.find((pl) => pl.id === actor);
  if (!p) return;
  const witnesses = state.players.filter((o) => o.id !== actor && o.alive && o.room === p.room && o.id !== hideFrom);
  const witnessed = hideFrom === undefined ? state.players.some((o) => o.id !== actor && o.alive && o.room === p.room) : witnesses.length > 0;
  const visibleTo = !witnessed ? [actor] : hideFrom === undefined ? "all" : [actor, ...witnesses.map((o) => o.id)];
  const entry: LogEntry = { cycle: state.cycle, key, ...(params && { params }), room: p.room, visibleTo };
  state.log.push(entry);
}
