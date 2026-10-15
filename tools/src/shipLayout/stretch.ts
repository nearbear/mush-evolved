// Our changes to the original room shapes, applied after conversion. The
// original drew one room at a time; we also draw the rooms behind the doors,
// lined up door to door, and that showed two problems:
// - Corridors are two cells of floor wide, too narrow to see into once the
//   rooms around them are drawn. Each corridor is widened to four.
// - The back corridor's doors are too close together for the rooms behind
//   them: Bedroom Beta landed on the Nexus, and Bay Beta on Bedroom Beta.
//   Lengthening the corridor between those doors pushes them apart (and the
//   bay's door to the bedroom then lines up exactly, which it didn't before).
//
// A stretch copies one line of floor and wall tiles `count` times and moves
// everything past it along. Only plain tiles are copied, never doors or the
// things standing on the floor, and nothing on the floor may straddle the line.

import type { RoomLayout, SliceInfo, TilePlacement } from "@mush2/shared";

export interface Stretch {
  room: string;
  axis: "x" | "y";
  /** The line to copy; the copies go right after it. */
  after: number;
  count: number;
}

export const STRETCHES: readonly Stretch[] = [
  // Front corridor: its west arm (one column) and its north arm (one row).
  { room: "CORRIDOR_A", axis: "x", after: 3, count: 2 },
  { room: "CORRIDOR_A", axis: "y", after: 15, count: 2 },
  { room: "CORRIDOR_B", axis: "x", after: 16, count: 2 },
  { room: "CORRIDOR_C", axis: "x", after: 16, count: 2 },
  // Back corridor, lengthened: 2 rows between the Nexus and Bedroom Beta doors, 1 between Bedroom Beta and Bay Beta.
  { room: "CORRIDOR_C", axis: "y", after: 21, count: 2 },
  { room: "CORRIDOR_C", axis: "y", after: 26, count: 1 },
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
    if (along(t) !== after) continue;
    if (t.kind === "door") fail(`${room.id}: a door at ${t.x},${t.y} is on the line to copy`);
    if (t.layer !== 0) continue;
    for (let k = 1; k <= count; k++) copies.push({ ...t, [axis]: after + k });
  }

  const moved = room.tiles.map((t) => (along(t) > after ? { ...t, [axis]: along(t) + count } : t));
  // Copies go last, so existing tiles keep their indices (sprite keys use them).
  return { ...room, tiles: [...moved, ...copies] };
}

function fail(message: string): never {
  throw new Error(`ship-layout stretch: ${message}`);
}
