// Things in the rooms that we move, applied after the stretches (stretch.ts), in the stretched room's
// coordinates. The original drew one room at a time; on the whole ship, Beta centre's turret dome sat
// in the corner against Bay Beta's side wall, which reaches four rows further out and is drawn in front
// of it. The room is lengthened toward the front (stretch.ts), and the dome moves to the front end of
// its outer edge, where its stand's left strut came out under the floor (owner, 2026-10-21).
//
// A move picks a tile by slice and cell and puts it on another cell. All of a room's moves look
// at where tiles were before any of them, so tiles can swap places. Tiles keep their indices
// (sprite keys use them), so floor under a moved dome is moved too, never added or dropped.

import type { RoomLayout } from "@mush2/shared";

export interface TileMove {
  room: string;
  slice: string;
  from: [x: number, y: number];
  to: [x: number, y: number];
}

export const MOVES: readonly TileMove[] = [
  // Beta centre: the dome, its chair and its stand three cells toward the front, back to where they were in
  // the room before the stretch added three columns behind them. The two cells the dome leaves without
  // floor come along: the floor that was on them fills the old ones.
  { room: "LASER_TURRET_B_1", slice: "turret_beta", from: [19, 18], to: [16, 18] },
  { room: "LASER_TURRET_B_1", slice: "chair_turret_beta", from: [20, 19], to: [17, 19] },
  { room: "LASER_TURRET_B_1", slice: "turret_beta_structure", from: [21, 20], to: [18, 20] },
  { room: "LASER_TURRET_B_1", slice: "GROUND", from: [16, 17], to: [19, 17] },
  { room: "LASER_TURRET_B_1", slice: "GROUND", from: [15, 18], to: [18, 18] },
];

/** Applies every move. Each must match exactly one tile. */
export function moveTiles(rooms: RoomLayout[], moves: readonly TileMove[] = MOVES): RoomLayout[] {
  for (const m of moves) if (!rooms.some((r) => r.id === m.room)) fail(`unknown room ${m.room}`);
  return rooms.map((room) => {
    const mine = moves.filter((m) => m.room === room.id);
    if (mine.length === 0) return room;
    const to = new Map<number, [number, number]>();
    for (const m of mine) {
      const hits = room.tiles.flatMap((t, i) => (t.slice === m.slice && t.x === m.from[0] && t.y === m.from[1] ? [i] : []));
      if (hits.length !== 1) fail(`${room.id}: ${hits.length} ${m.slice} tiles at ${m.from}, want 1`);
      to.set(hits[0]!, m.to);
    }
    return { ...room, tiles: room.tiles.map((t, i) => (to.has(i) ? { ...t, x: to.get(i)![0], y: to.get(i)![1] } : t)) };
  });
}

function fail(message: string): never {
  throw new Error(`ship-layout moves: ${message}`);
}
