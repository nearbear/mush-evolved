// ---- Room log -------------------------------------------------------------
// Four kinds of entry (rules from 2026-10-11; cameras and covert from 2026-10-17):
//   public:  part of the room's history; anyone in the room sees it, then or later.
//   private: only the actor ever sees it.
//   secret:  becomes room history if someone else was there to witness it, or
//            a camera was in the room; otherwise only the actor sees it.
//   covert:  bystanders don't see it; it becomes room history only if a camera
//            was in the room; otherwise only the actor sees it.
// A camera is `CAMERA` room equipment, put there by `install` (#35). A `camera`
// item, lying in a room or carried, is not a camera yet.
// A private list names bodies, which never change, so a private line stays with
// the body across a Transfer (owner, 2026-11-05, #281) and the log only grows.

import type { ActionVisibility } from "./actions/action.ts";
import { CAMERA_EQUIPMENT } from "./equipment.ts";
import type { GameState, LogEntry, LogParams, PlayerId, PlayerState, RoomId } from "./types.ts";

/** Appends `entry` with the next id and the current cycle. Every log line goes through here. Mutates a state the caller already cloned. */
export function pushLog(state: GameState, entry: Omit<LogEntry, "id" | "cycle">): void {
  state.log.push({ id: state.nextLogId++, cycle: state.cycle, ...entry });
}

/** Mutates a state that the caller already cloned. */
export function logPublic(state: GameState, room: RoomId | undefined, key: string, params?: LogParams, level?: "warning"): void {
  pushLog(state, { key, ...(params && { params }), ...(room !== undefined && { room }), visibleTo: "all", ...(level && { level }) });
}

/** Mutates a state that the caller already cloned. */
export function logPrivate(state: GameState, actor: PlayerId, key: string, params?: LogParams): void {
  const p = state.players.find((pl) => pl.id === actor);
  pushLog(state, { key, ...(params && { params }), ...(p && { room: p.room }), visibleTo: [actor] });
}

/**
 * Mutates a state that the caller already cloned. `hideFrom` is someone who must
 * not see the entry even if present: when it is set and there are witnesses but no
 * camera, the entry goes to the actor and those witnesses only. A camera shows it
 * to everyone, `hideFrom` included.
 */
export function logSecret(state: GameState, actor: PlayerId, key: string, params?: LogParams, hideFrom?: PlayerId): void {
  const p = state.players.find((pl) => pl.id === actor);
  if (!p) return;
  if (p.outcastBy !== undefined) {
    logPublic(state, p.room, key, params);
    return;
  }
  const witnesses = state.players.filter((o) => o.id !== actor && o.alive && o.room === p.room && o.id !== hideFrom);
  const witnessed = hideFrom === undefined ? state.players.some((o) => o.id !== actor && o.alive && o.room === p.room) : witnesses.length > 0;
  const visibleTo = hasCamera(state, p.room) ? "all" : !witnessed ? [actor] : hideFrom === undefined ? "all" : [actor, ...witnesses.map((o) => o.id)];
  pushLog(state, { key, ...(params && { params }), room: p.room, visibleTo, ...spilled(visibleTo) });
}

/** Mutates a state that the caller already cloned. Room history only if a camera saw it. */
export function logCovert(state: GameState, actor: PlayerId, key: string, params?: LogParams): void {
  const p = state.players.find((pl) => pl.id === actor);
  if (!p) return;
  if (p.outcastBy !== undefined) {
    logPublic(state, p.room, key, params);
    return;
  }
  const visibleTo = hasCamera(state, p.room) ? "all" : [actor];
  pushLog(state, { key, ...(params && { params }), room: p.room, visibleTo, ...spilled(visibleTo) });
}

/** A secret or covert entry that reached anyone besides the actor is a warning. One only the actor sees is not. */
function spilled(visibleTo: LogEntry["visibleTo"]): { level?: "warning" } {
  return visibleTo === "all" || visibleTo.length > 1 ? { level: "warning" } : {};
}

/**
 * Whether someone in the actor's room sees them busy with an action of this visibility (its bar): exactly when the
 * action's log entry could reach them. A witness always sees public and secret entries, covert ones only on camera.
 */
export function activitySeen(state: Readonly<GameState>, room: RoomId, visibility: ActionVisibility, actor?: Readonly<PlayerState>): boolean {
  // An Outcast's stealth is gone (anathema.ts): their covert and secret entries are public room history.
  if (actor?.outcastBy !== undefined && visibility !== "private") return true;
  return visibility === "public" || visibility === "secret" || (visibility === "covert" && hasCamera(state, room));
}

export function hasCamera(state: Readonly<GameState>, room: RoomId): boolean {
  return (state.equipment[room] ?? []).some((e) => e.type === CAMERA_EQUIPMENT && !e.broken);
}
