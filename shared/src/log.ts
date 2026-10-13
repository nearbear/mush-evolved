// ---- Room log -------------------------------------------------------------
// Three kinds of entry (rules from 2026-10-11; secret handling will change):
//   public:  part of the room's history; anyone in the room sees it, then or later.
//   private: only the actor ever sees it.
//   secret:  becomes room history only if someone else was there to witness it;
//            otherwise only the actor sees it.

import { SHIP_ROOMS } from "./config.ts";
import type { GameState, LogEntry, PlayerId, RoomId } from "./types.ts";

const ROOM_LABELS = new Map(SHIP_ROOMS.map((r) => [r.id, r.label]));

/** Display name for a room in log text; falls back to the id. */
export function roomName(room: RoomId): string {
  return ROOM_LABELS.get(room) ?? room;
}

/** Mutates a state that the caller already cloned. */
export function logPublic(state: GameState, room: RoomId | undefined, text: string): void {
  state.log.push({ cycle: state.cycle, text, ...(room !== undefined && { room }), visibleTo: "all" });
}

/** Mutates a state that the caller already cloned. */
export function logPrivate(state: GameState, actor: PlayerId, text: string): void {
  const p = state.players.find((pl) => pl.id === actor);
  state.log.push({ cycle: state.cycle, text, ...(p && { room: p.room }), visibleTo: [actor] });
}

/** Mutates a state that the caller already cloned. */
export function logSecret(state: GameState, actor: PlayerId, text: string): void {
  const p = state.players.find((pl) => pl.id === actor);
  if (!p) return;
  const witnessed = state.players.some((o) => o.id !== actor && o.alive && o.room === p.room);
  const entry: LogEntry = { cycle: state.cycle, text, room: p.room, visibleTo: witnessed ? "all" : [actor] };
  state.log.push(entry);
}
