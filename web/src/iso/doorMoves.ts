// Who just came into or went out of your room, and by which door, from the room's log: its public
// "entered" and "left" entries (shared/src/actions/move.ts). The iso view walks them through that
// door. Nothing here that the log doesn't already show the player.

import type { LogEntry, RoomId } from "@mush2/shared";

/** How recent a move must be to be walked: older ones are history, not someone at the door now. */
const RECENT_MS = 15_000;

/**
 * Each player's latest recent move in the log, by player id: the room they came in from and the
 * one they went out to. `now` is the server's clock; entries without a time are left out.
 */
export function recentDoorMoves(
  log: readonly LogEntry[],
  players: readonly { id: string; character: string }[],
  now: number,
): Map<string, { from?: RoomId; to?: RoomId }> {
  const byCharacter = new Map(players.map((p) => [p.character, p.id]));
  const moves = new Map<string, { from?: RoomId; to?: RoomId }>();
  for (const e of log) {
    if ((e.key !== "entered" && e.key !== "left") || e.at === undefined || now - e.at > RECENT_MS) continue;
    const id = byCharacter.get(String(e.params?.name));
    const room = e.params?.room;
    if (!id || typeof room !== "string") continue;
    moves.set(id, { ...moves.get(id), [e.key === "entered" ? "from" : "to"]: room as RoomId });
  }
  return moves;
}
