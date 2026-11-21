// Who just came into or went out of your room, and by which door, from the room's log: its public
// "entered" and "left" entries (shared/src/actions/move.ts). The iso view walks them through that
// door. Without Tracker the view gives "enteredRoom" and "leftRoom" instead, with no room (owner,
// 2026-11-21): they fade in and out where they stand, so no door gives the direction away. Nothing
// here that the log doesn't already show the player.

import type { LogLine, RoomId } from "@mush2/shared";

/** How recent a move must be to be walked: older ones are history, not someone at the door now. */
const RECENT_MS = 15_000;

/** A recent move: the door they came in or went out by, or, with no door known, that they fade in or out. */
export interface DoorMove {
  from?: RoomId;
  to?: RoomId;
  fadeIn?: true;
  fadeOut?: true;
}

const MOVE_KEYS: Readonly<Record<string, { side: "in" | "out"; door: boolean }>> = {
  entered: { side: "in", door: true },
  left: { side: "out", door: true },
  enteredRoom: { side: "in", door: false },
  leftRoom: { side: "out", door: false },
};

/**
 * Each player's latest recent move in the log, by player id: the room they came in from and the
 * one they went out to, or that they fade in or out. `now` is the server's clock; entries without a time are left out.
 */
export function recentDoorMoves(log: readonly LogLine[], players: readonly { id: string; character: string }[], now: number): Map<string, DoorMove> {
  const byCharacter = new Map(players.map((p) => [p.character, p.id]));
  const moves = new Map<string, DoorMove>();
  for (const e of log) {
    const move = MOVE_KEYS[e.key];
    if (!move || e.at === undefined || now - e.at > RECENT_MS) continue;
    const id = byCharacter.get(String(e.params?.name));
    if (!id) continue;
    const { from, to, fadeIn, fadeOut, ...rest } = moves.get(id) ?? {};
    const kept = move.side === "in" ? { ...rest, ...(to && { to }), ...(fadeOut && { fadeOut }) } : { ...rest, ...(from && { from }), ...(fadeIn && { fadeIn }) };
    if (!move.door) {
      moves.set(id, { ...kept, ...(move.side === "in" ? { fadeIn: true } : { fadeOut: true }) });
      continue;
    }
    const room = e.params?.room;
    if (typeof room !== "string") continue;
    moves.set(id, { ...kept, [move.side === "in" ? "from" : "to"]: room as RoomId });
  }
  return moves;
}
