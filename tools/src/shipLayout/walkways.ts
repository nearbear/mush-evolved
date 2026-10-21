// Walkways we add to the floors, and the corridors' deck floor.
//
// Walkways are painted in two steps. First (`paintWalkways`) as the milky blue path tile (GROUND
// frame 1) the original draws in the dorms, the sick bay and the storage rooms, painted over plain
// floor. Applied after the stretches (stretch.ts), in each room's stretched cells, and before rooms
// are placed: a door with a walkway behind it is then pinned there, and the door on the other side
// slides to meet it (roomPositions.ts).
//
// Then, once rooms are placed (`deckFloors`), the rooms in DECK_ROOMS get the bays' and the
// bridge's floor instead (GROUND_DECK): the grey plates in a 2x2 pattern laid on the ship grid, so
// it runs on from one corridor into the next, and each walkway as the deck's two-cell path with its
// edges and the curves where one path branches off another. The deck art only has branches off a
// path's -y, +y and +x sides; one off a path's -x side fails loudly.
//
// Only plain GROUND tiles are repainted (never floor tiles under or beside other art), and tile
// indices are kept.

import type { RoomLayout } from "@mush2/shared";

export interface Walkway {
  room: string;
  /** The way the path runs; it is two cells wide across it. */
  along: "x" | "y";
  /** Inclusive cell range, in the room's own (stretched) cells. */
  x: [number, number];
  y: [number, number];
}

const PLAIN = { slice: "GROUND", frame: 0 };
const PATH = { slice: "GROUND", frame: 1 };

const DECK = "GROUND_DECK";
/** GROUND_DECK frames for a path cell: [low side, high side] across the path. */
const DECK_PATH = { x: [9, 8], y: [11, 10] } as const;
/** A path along x with another meeting its -y side ([low x, high x] of the other path), or its +y side. */
const DECK_BRANCH_LOW_Y = [15, 14] as const;
const DECK_BRANCH_HIGH_Y = [12, 13] as const;
/** A path along y with another meeting its +x side ([low y, high y] of the other path). */
const DECK_BRANCH_HIGH_X = [18, 19] as const;

export const DECK_ROOMS: readonly string[] = ["CORRIDOR_A", "CORRIDOR_B", "CORRIDOR_C"];

export const WALKWAYS: readonly Walkway[] = [
  // Front corridor: the bridge door to the centre corridor, down the middle two rows of the long arm.
  { room: "CORRIDOR_A", along: "x", x: [3, 28], y: [16, 17] },
  // Centre corridor: Bay Alpha to Bay Bravo, with the front corridor's path coming in across it.
  { room: "CORRIDOR_B", along: "x", x: [16, 19], y: [17, 18] },
  { room: "CORRIDOR_B", along: "y", x: [18, 19], y: [6, 16] },
  { room: "CORRIDOR_B", along: "y", x: [18, 19], y: [19, 29] },
  // Back corridor: Bay Bravo across to Icarus Bay, and Bay Alpha 2 down to it.
  { room: "CORRIDOR_C", along: "x", x: [16, 19], y: [29, 30] },
  { room: "CORRIDOR_C", along: "y", x: [16, 17], y: [3, 28] },
];

export function paintWalkways(rooms: RoomLayout[], walkways: readonly Walkway[] = WALKWAYS): RoomLayout[] {
  for (const w of walkways) {
    const room = rooms.find((r) => r.id === w.room) ?? fail(`unknown room ${w.room}`);
    const across = w.along === "x" ? w.y : w.x;
    if (across[1] - across[0] !== 1) fail(`${w.room}: a walkway along ${w.along} must be two cells wide`);
    for (let x = w.x[0]; x <= w.x[1]; x++) {
      for (let y = w.y[0]; y <= w.y[1]; y++) {
        const ground = room.tiles.filter((t) => t.kind === "ground" && t.x === x && t.y === y);
        if (ground.length !== 1 || ground[0]!.slice !== PLAIN.slice || ground[0]!.frame !== PLAIN.frame) fail(`${w.room}: (${x},${y}) isn't plain floor`);
      }
    }
  }
  return rooms.map((room) => {
    const mine = walkways.filter((w) => w.room === room.id);
    if (mine.length === 0) return room;
    return { ...room, tiles: room.tiles.map((t) => (t.kind === "ground" && mine.some((w) => inside(w, t.x, t.y)) ? { ...t, ...PATH } : t)) };
  });
}

/**
 * The rooms in `deck` floored like the bays (see the top of this file). Runs on placed rooms: the
 * plates' pattern follows the ship grid.
 */
export function deckFloors(rooms: RoomLayout[], walkways: readonly Walkway[] = WALKWAYS, deck: readonly string[] = DECK_ROOMS): RoomLayout[] {
  for (const id of deck) if (!rooms.some((r) => r.id === id)) fail(`unknown room ${id}`);
  return rooms.map((room) => {
    if (!deck.includes(room.id)) return room;
    const at = room.at ?? fail(`${room.id} has no place on the ship`);
    const mine = walkways.filter((w) => w.room === room.id);
    const plate = (x: number, y: number) => (mod2(y + at.y) ? 1 : 0) + (mod2(x + at.x) ? 2 : 0);
    const tiles = room.tiles.map((t) => {
      if (t.kind !== "ground" || t.slice !== PLAIN.slice) return t;
      if (t.frame === PLAIN.frame) return { ...t, slice: DECK, frame: plate(t.x, t.y) };
      if (t.frame === PATH.frame) return { ...t, slice: DECK, frame: pathFrame(room.id, mine, t.x, t.y) };
      return t;
    });
    return { ...room, tiles };
  });
}

/** The deck frame for walkway cell (x, y): the path's own, or a branch where another path meets this side of it. */
function pathFrame(room: string, walkways: readonly Walkway[], x: number, y: number): number {
  const w = walkways.find((w) => inside(w, x, y)) ?? fail(`${room}: (${x},${y}) is path floor outside every walkway`);
  const at = (cx: number, cy: number) => walkways.find((o) => o !== w && inside(o, cx, cy));
  if (w.along === "x") {
    const high = y === w.y[1];
    const other = at(x, high ? y + 1 : y - 1);
    if (other?.along === "y") return (high ? DECK_BRANCH_HIGH_Y : DECK_BRANCH_LOW_Y)[x === other.x[0] ? 0 : 1];
    return DECK_PATH.x[high ? 1 : 0];
  }
  const high = x === w.x[1];
  const other = at(high ? x + 1 : x - 1, y);
  if (other?.along === "x") {
    if (!high) fail(`${room}: no deck art for a path branching off the -x side of another, at (${x},${y})`);
    return DECK_BRANCH_HIGH_X[y === other.y[0] ? 0 : 1];
  }
  return DECK_PATH.y[high ? 1 : 0];
}

const inside = (w: Walkway, x: number, y: number) => x >= w.x[0] && x <= w.x[1] && y >= w.y[0] && y <= w.y[1];
const mod2 = (n: number) => ((n % 2) + 2) % 2 === 1;

function fail(message: string): never {
  throw new Error(`ship-layout walkways: ${message}`);
}
