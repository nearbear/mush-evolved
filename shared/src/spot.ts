// Where you stand in your room (issues #17 and #21, decided 2026-10-20): a floor cell, or a chair on one, set by the
// free `walk` input, or the door you came in by until you walk off. Mostly cosmetic, but real state: roommates see
// it (`OtherPlayerView.spot`), so it can give away what you walk up to. The client decides which walks to share: floor
// and chair clicks, and walking up to the target of a public action (owner, 2026-10-20). The rules know rooms, not
// cells, so a cell is only checked for size; the client stands someone on a cell it can't walk to in the usual spot.
// Pushing a wheelchair (owner, 2026-10-24), your walks steer it: the cell is where the person you push goes, and you
// stand at `behind`, the cell the client puts you in behind them (it draws you following their trail there).
// Opening a terminal's window (`access`) sits you on a free chair at it, or stands you there (#192, owner 2026-11-08):
// an `occupancy` spot, set here so "free" is the server's to say. Closing the window gets you up: the client sends a
// walk, as it does for any walk, and moving rooms does too. Roommates see it as the Focused status.

import type { ActionDef } from "./actions.ts";
import { SHIP_ROOMS } from "./config.ts";
import { removeStatus } from "./statuses.ts";
import { cloneState, fail, findPlayer, type ActionResult } from "./helpers.ts";
import type { Action, GameState, PlayerId, PlayerState, RoomId, Spot } from "./types.ts";

/** How far from the room's origin a cell may be, either way. Rooms are a few dozen cells across. */
export const MAX_SPOT_CELL = 500;

/** A whole cell no further from the origin than `MAX_SPOT_CELL`. */
export const isSpotCell = (x: unknown, y: unknown): boolean => [x, y].every((n) => Number.isInteger(n) && Math.abs(n as number) <= MAX_SPOT_CELL);

/**
 * Walk to a cell of your room, sitting down there if `sitting` (a chair). Free, and not an action: nothing queues or
 * waits. While you push someone's wheelchair, they go to the cell instead, and you to `behind` (if given); nobody sits.
 */
export function walk(state: GameState, playerId: PlayerId, x: number, y: number, sitting: boolean, behind?: { x: number; y: number }): ActionResult {
  const p = findPlayer(state, playerId);
  if (!p) return fail("unknown_player");
  if (!state.config.sharedSpots || !p.alive || state.phase !== "playing") return fail("cant_walk");
  // In bed or pushed in a wheelchair, you can't wander off (as the client already stops you).
  if (p.lyingIn !== undefined || p.pushedBy !== undefined) return fail("cant_walk");
  if (!isSpotCell(x, y) || (behind && !isSpotCell(behind.x, behind.y))) return fail("cant_walk");
  const next = cloneState(state);
  const me = findPlayer(next, playerId)!;
  const pushed = next.players.find((o) => o.pushedBy === me.id);
  if (pushed) {
    pushed.spot = { kind: "cell", x, y };
    if (behind) me.spot = { kind: "cell", x: behind.x, y: behind.y };
  } else me.spot = { kind: "cell", x, y, ...(sitting && { sitting: true }) };
  return { ok: true, state: next };
}

/**
 * Sending a public action gets you up from a chair (owner, 2026-10-20). Other actions leave you seated as your roommates
 * see it, since standing up would tell them you just did something they can't otherwise see; your own screen stands
 * you up for any action. Mutates a cloned state.
 */
export function standUp(p: PlayerState, action: Pick<ActionDef<Action>, "visibility">): void {
  if (action.visibility === "public" && p.spot?.kind === "cell") delete p.spot.sitting;
}

/** You came into your room through the door from `from`: you stand in front of it until you walk off. Mutates a cloned state. */
export function arrive(p: PlayerState, from: RoomId): void {
  p.spot = { kind: "door", door: from } satisfies Spot;
  p.enteredFrom = from;
  removeStatus(p, "guardian"); // changing room ends guarding (guard.ts)
  delete p.hackedEquipment;
}

/** The cells of the chairs at a terminal, from the map (`ShipRoom` equipment's `chairs`); none for most equipment. */
export function terminalChairs(room: RoomId, equipment: string): readonly { x: number; y: number }[] {
  return SHIP_ROOMS.find((r) => r.id === room)?.equipment.find((e) => e.id === equipment)?.chairs ?? [];
}

/**
 * Sit at the terminal `equipment` in your room (its window opened): on the first of its chairs nobody else in the room
 * has, by a terminal or by sitting down on it, or standing at it if they're all taken or it has none. Staying where
 * you are if you're already at it. Not while you can't walk (in bed, in or pushing a wheelchair). Mutates a cloned state.
 */
export function occupy(state: GameState, p: PlayerState, equipment: string): void {
  if (!state.config.sharedSpots || !p.alive || p.lyingIn !== undefined || p.pushedBy !== undefined) return;
  if (state.players.some((o) => o.pushedBy === p.id)) return;
  if (p.spot?.kind === "occupancy" && p.spot.equipment === equipment) return;
  const others = state.players.filter((o) => o.id !== p.id && o.alive && o.room === p.room);
  const taken = (cell: { x: number; y: number }, chair: number) =>
    others.some(({ spot }) =>
      spot?.kind === "occupancy"
        ? spot.equipment === equipment && spot.chair === chair
        : spot?.kind === "cell" && spot.sitting === true && spot.x === cell.x && spot.y === cell.y,
    );
  const chair = terminalChairs(p.room, equipment).findIndex((cell, i) => !taken(cell, i));
  p.spot = { kind: "occupancy", equipment, ...(chair >= 0 && { chair }) };
}

/** Lying down or a wheelchair push takes you away from a terminal (its window can't stay open): no spot, as before you walked. Mutates a cloned state. */
export function leaveTerminal(p: PlayerState): void {
  if (p.spot?.kind === "occupancy") delete p.spot;
}
