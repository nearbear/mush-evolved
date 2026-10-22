// Our changes to the original room shapes, applied after conversion. The
// original drew one room at a time; we also draw the rooms behind the doors,
// lined up door to door, and that showed two problems:
// - Corridors are two cells of floor wide, too narrow to see into once the
//   rooms around them are drawn. Each corridor is widened to four. The
//   front corridor's end doors (two cells wide) are kept in the middle, one
//   wall either side: the line before the door and the door's own line are
//   each copied once.
// - The back corridor's doors are too close together for the rooms behind
//   them: Bedroom Beta landed on the Nexus, and Bay Beta on Bedroom Beta.
//   Lengthening the corridor between those doors pushes them apart (and the
//   bay's door to the bedroom then lines up exactly, which it didn't before).
// - Beta centre's turret dome was hidden behind Bay Beta's side wall. The
//   room is lengthened toward the front so the dome can move there (moves.ts);
//   its position moves back as far, so its doors stay where they were.
//
// A stretch copies one line of floor and wall tiles `count` times and moves
// everything past it along. Only plain tiles are copied, never the things
// standing on the floor, and nothing on the floor may straddle the line. A
// door on the line is copied as the wall beside it (none for a front-edge door,
// which has no wall beside it), so the copies never add a door.

import type { RoomLayout, SliceInfo, TilePlacement } from "@mush2/shared";

export interface Stretch {
  room: string;
  axis: "x" | "y";
  /** The line to copy; the copies go right after it. */
  after: number;
  count: number;
}

export const STRETCHES: readonly Stretch[] = [
  // Front corridor: its west arm (no end doors) and its north arm, whose two-cell doors to the bridge and the
  // centre corridor get one wall on each side.
  { room: "CORRIDOR_A", axis: "x", after: 3, count: 2 },
  { room: "CORRIDOR_A", axis: "y", after: 15, count: 1 },
  { room: "CORRIDOR_A", axis: "y", after: 16, count: 1 },
  { room: "CORRIDOR_B", axis: "x", after: 16, count: 2 },
  { room: "CORRIDOR_C", axis: "x", after: 16, count: 2 },
  // Back corridor, lengthened: 2 rows between the Nexus and Bedroom Beta doors, 1 between Bedroom Beta and Bay Beta.
  { room: "CORRIDOR_C", axis: "y", after: 21, count: 2 },
  { room: "CORRIDOR_C", axis: "y", after: 26, count: 1 },
  // Beta centre: three columns just inside its front wall.
  { room: "LASER_TURRET_B_1", axis: "x", after: 12, count: 3 },
];

/**
 * Applies every stretch for each room. Stretches on one axis are applied from
 * the far end back, so each `after` refers to the original coordinates.
 */
export function stretchRooms(rooms: RoomLayout[], slices: Record<string, SliceInfo>, stretches: readonly Stretch[] = STRETCHES): RoomLayout[] {
  for (const s of stretches) if (!rooms.some((r) => r.id === s.room)) fail(`unknown room ${s.room}`);
  return rooms.map((room) =>
    stretches
      .filter((s) => s.room === room.id)
      .sort((a, b) => b.after - a.after)
      .reduce((r, s) => stretchRoom(r, slices, s), room),
  );
}

export function stretchRoom(room: RoomLayout, slices: Record<string, SliceInfo>, { axis, after, count }: Stretch): RoomLayout {
  const along = (t: { x: number; y: number }) => (axis === "x" ? t.x : t.y);
  const floor = new Set(room.tiles.filter((t) => t.kind === "ground").map((t) => `${t.x},${t.y}`));
  const copies: TilePlacement[] = [];
  /** The wall before a door on the line, in the same wall row: a door's copies are walls. */
  const wallBeside = (door: TilePlacement): TilePlacement | undefined => {
    const before = axis === "x" ? { x: door.x - 1, y: door.y } : { x: door.x, y: door.y - 1 };
    const wall = room.tiles.find((t) => t.kind === "wall" && t.layer === 0 && t.x === before.x && t.y === before.y);
    return wall && { ...wall, x: door.x, y: door.y };
  };

  for (const t of room.tiles) {
    // Footprints extend toward -x/-y from the anchor.
    const [w, h] = slices[t.slice]?.footprint ?? [1, 1];
    const start = along(t) - (axis === "x" ? w : h) + 1;
    if (start <= after && along(t) > after) {
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          if (floor.has(`${t.x - i},${t.y - j}`)) fail(`${room.id}: ${t.slice} at ${t.x},${t.y} straddles ${axis} = ${after}`);
        }
      }
    }
    if (along(t) !== after || t.layer !== 0) continue;
    const copy = t.kind === "door" ? wallBeside(t) : t;
    for (let k = 1; copy && k <= count; k++) copies.push({ ...copy, [axis]: after + k });
  }

  const moved = room.tiles.map((t) => (along(t) > after ? { ...t, [axis]: along(t) + count } : t));
  // Copies go last, so existing tiles keep their indices (sprite keys use them).
  return { ...room, tiles: [...moved, ...copies] };
}

function fail(message: string): never {
  throw new Error(`ship-layout stretch: ${message}`);
}
