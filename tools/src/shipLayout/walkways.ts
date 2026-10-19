// Walkways we add to the floors: the milky blue path tile (GROUND frame 1) the original draws in
// the dorms, the sick bay and the storage rooms, painted over plain floor. Applied after the
// stretches (stretch.ts), in each room's stretched cells, and before rooms are placed: a door with
// a walkway behind it is then pinned there, and the door on the other side slides to meet it
// (roomPositions.ts).
//
// Only plain GROUND tiles are repainted (never floor tiles under or beside other art), and tile
// indices are kept.

import type { RoomLayout } from "@mush2/shared";

export interface Walkway {
  room: string;
  /** Inclusive cell range, in the room's own (stretched) cells. */
  x: [number, number];
  y: [number, number];
}

const PLAIN = { slice: "GROUND", frame: 0 };
const PATH = { slice: "GROUND", frame: 1 };

export const WALKWAYS: readonly Walkway[] = [
  // Across the back corridor, joining each dorm's walkway to its rear storage's.
  { room: "CORRIDOR_C", x: [16, 19], y: [4, 5] }, // Bedroom Alpha to Rear Alpha Storage
  { room: "CORRIDOR_C", x: [16, 19], y: [24, 25] }, // Bedroom Bravo to Rear Bravo Storage
  // Bridge door to refectory door: the middle two rows of the front corridor's long arm, then across the centre corridor.
  { room: "CORRIDOR_A", x: [3, 28], y: [16, 17] },
  { room: "CORRIDOR_B", x: [16, 19], y: [17, 18] },
];

export function paintWalkways(rooms: RoomLayout[], walkways: readonly Walkway[] = WALKWAYS): RoomLayout[] {
  for (const w of walkways) {
    const room = rooms.find((r) => r.id === w.room) ?? fail(`unknown room ${w.room}`);
    for (let x = w.x[0]; x <= w.x[1]; x++) {
      for (let y = w.y[0]; y <= w.y[1]; y++) {
        const ground = room.tiles.filter((t) => t.kind === "ground" && t.x === x && t.y === y);
        if (ground.length !== 1 || ground[0]!.slice !== PLAIN.slice || ground[0]!.frame !== PLAIN.frame) fail(`${w.room}: (${x},${y}) isn't plain floor`);
      }
    }
  }
  const inside = (w: Walkway, x: number, y: number) => x >= w.x[0] && x <= w.x[1] && y >= w.y[0] && y <= w.y[1];
  return rooms.map((room) => {
    const mine = walkways.filter((w) => w.room === room.id);
    if (mine.length === 0) return room;
    return { ...room, tiles: room.tiles.map((t) => (t.kind === "ground" && mine.some((w) => inside(w, t.x, t.y)) ? { ...t, ...PATH } : t)) };
  });
}

function fail(message: string): never {
  throw new Error(`ship-layout walkways: ${message}`);
}
