// Where each room sits on the ship: one grid for the whole ship, so every room is in the same
// place whichever room you stand in. The converter copies these onto the rooms in
// ship-layout.json (`RoomLayout.at`), and the iso view places neighbours from them.
//
// Positions are in stretched coordinates (after stretch.ts): a room's tile at (x, y) is at
// (x + at.x, y + at.y) on the ship. To move a room, change its numbers here, run
// `npm run ship-layout`, then `npm run ship-check` to see overlaps and doors that don't line up.
// `npm run ship-check -- --seed <ROOM>` prints a fresh table placed door to door from that room,
// and `--fit` then nudges rooms apart until nothing overlaps.
//
// The original's doors don't all agree with each other (placed door to door, the ship comes out
// differently from each room), so once rooms are placed, doors move along their walls to meet
// (alignDoors): a door with a path drawn on the floor to it stays on that path, and the door on
// the other side comes to it. Doors still apart after that are ship-check's to report.

import type { RoomLayout, SliceInfo, TilePlacement } from "@mush2/shared";

export type Positions = Record<string, { x: number; y: number }>;

// From `npm run ship-check -- --seed BEDROOM_A --fit` (2026-10-19), the best seed of every room
// once doors were kept on their floor paths.
export const ROOM_POSITIONS: Positions = {
  BEDROOM_A: { x: 0, y: 0 },
  SPACESHIP_BAY_A: { x: -6, y: -8 },
  CORRIDOR_C: { x: 6, y: 10 },
  LASER_TURRET_A_1: { x: -18, y: -8 },
  SPACESHIP_BAY_AA: { x: 15, y: -9 },
  CORRIDOR_B: { x: -17, y: 7 },
  STORAGE_A_0: { x: -8, y: 0 },
  STORAGE_A_1: { x: 16, y: -1 },
  NEXUS_ROOM: { x: 3, y: 10 },
  BEDROOM_B: { x: 0, y: 18 },
  STORAGE_B_1: { x: 15, y: 19 },
  SPACESHIP_BAY_B: { x: -7, y: 26 },
  ICARUS: { x: 17, y: 27 },
  STORAGE_FRONT: { x: -23, y: 1 },
  LASER_TURRET_A_2: { x: 30, y: -5 },
  MOTOR_ROOM: { x: 30, y: 9 },
  CORRIDOR_A: { x: -31, y: 8 },
  REFECTORY: { x: -7, y: 9 },
  STORAGE_B_0: { x: -8, y: 18 },
  LASER_TURRET_B_1: { x: -18, y: 25 },
  LASER_TURRET_B_2: { x: 32, y: 25 },
  HYDROPONIC_CENTER: { x: -35, y: 0 },
  LASER_TURRET_A_0: { x: -46, y: -3 },
  COMMAND_CENTER: { x: -49, y: 6 },
  LABORATORY: { x: -34, y: 16 },
  SICK_BAY: { x: -23, y: 17 },
  LASER_TURRET_B_0: { x: -46, y: 20 },
};

/** Doors on a room's open front edges (+x for DOOR_BR, +y for DOOR_BL): never drawn while the room behind them is. */
export const FRONT_DOORS: ReadonlySet<string> = new Set(["DOOR_BR", "DOOR_BL"]);

type Cell = { x: number; y: number };

/**
 * Copies each room's position onto it (rooms the table leaves out get none; ship-check lists them),
 * then lines doors up with their neighbours' (alignDoors).
 */
export function placeRooms(rooms: RoomLayout[], slices: Record<string, SliceInfo>, positions: Positions = ROOM_POSITIONS): RoomLayout[] {
  for (const id of Object.keys(positions)) if (!rooms.some((r) => r.id === id)) fail(`unknown room ${id}`);
  const placed = rooms.map(({ at: _, ...room }) => (positions[room.id] ? { ...room, at: positions[room.id] } : room));
  return alignDoors(placed, slices);
}

/**
 * Moves doors along their wall or edge onto the neighbour's door back, where a door may move
 * (`keepsPath`):
 * 1. Front-edge doors onto the drawn door behind them. They aren't drawn once that room is, so
 *    this changes no art, only where you walk through.
 * 2. Drawn doors still apart from a front-edge door (one pinned to the path drawn to it) slide
 *    along their wall to meet it: the door and its doormat move, and the wall tiles where it
 *    lands fill the doorway it leaves. Not onto a cell with anything else on it (a camera, say).
 * Doors still apart after that are ship-check's to report. Tile indices are kept.
 */
export function alignDoors(rooms: RoomLayout[], slices: Record<string, SliceInfo>): RoomLayout[] {
  const fronts = rooms.map((room) => alignRoom(room, rooms, slices, (door, back) => FRONT_DOORS.has(door.slice) && !FRONT_DOORS.has(back.slice)));
  return fronts.map((room) => alignRoom(room, fronts, slices, (door, back) => !FRONT_DOORS.has(door.slice) && FRONT_DOORS.has(back.slice)));
}

function alignRoom(room: RoomLayout, rooms: readonly RoomLayout[], slices: Record<string, SliceInfo>, which: (door: TilePlacement, back: TilePlacement) => boolean): RoomLayout {
  const at = room.at;
  if (!at) return room;
  let out = room;
  room.tiles.forEach((door, i) => {
    const other = door.door && rooms.find((r) => r.id === door.door!.target);
    const back = other?.tiles.find((b) => b.door?.target === room.id);
    const axes = doorAxes(slices, door);
    if (!other?.at || !back || !axes || !which(door, back)) return;
    const target = { x: back.x + other.at.x - at.x, y: back.y + other.at.y - at.y };
    // Only along its own wall or edge.
    if (target[axes.across] !== door[axes.across] || target[axes.along] === door[axes.along]) return;
    out = moveDoor(out, slices, i, target) ?? out;
  });
  return out;
}

/** The room with door `i` moved to `to`, or undefined when it may not go there. */
function moveDoor(room: RoomLayout, slices: Record<string, SliceInfo>, i: number, to: Cell): RoomLayout | undefined {
  const door = room.tiles[i]!;
  const moved = { ...door, ...to };
  if (!keepsPath(room, room, slices, door, moved)) return undefined;
  if (FRONT_DOORS.has(door.slice)) return { ...room, tiles: room.tiles.map((t, j) => (j === i ? moved : t)) };
  const key = (c: Cell) => `${c.x},${c.y}`;
  const before = doorCells(slices, door), after = doorCells(slices, moved);
  const landing = after.filter((c) => !before.some((b) => key(b) === key(c)));
  const leaving = before.filter((c) => !after.some((a) => key(a) === key(c)));
  // Each cell the door lands on holds a plain wall and nothing else; that wall fills a cell it leaves.
  const moves = new Map<number, Cell>([[i, to]]);
  for (const [k, c] of landing.entries()) {
    const here = room.tiles.flatMap((t, j) => (t.x === c.x && t.y === c.y ? [j] : []));
    const wall = here.length === 1 ? here[0]! : -1;
    if (wall < 0 || room.tiles[wall]!.kind !== "wall" || room.tiles[wall]!.layer !== 0) return undefined;
    moves.set(wall, leaving[k]!);
  }
  // The doormat drawn on the door's cell goes with it.
  room.tiles.forEach((t, j) => {
    if (j !== i && t.x === door.x && t.y === door.y && /^DOOR_.*_FLOOR$/.test(t.slice)) moves.set(j, to);
  });
  return { ...room, tiles: room.tiles.map((t, j) => (moves.has(j) ? { ...t, ...moves.get(j)! } : t)) };
}

/** The axis a door's two cells run along (its wall or edge), the one across it, and the side its room's floor is on. */
function doorAxes(slices: Record<string, SliceInfo>, door: Pick<TilePlacement, "slice">): { along: "x" | "y"; across: "x" | "y"; inward: 1 | -1 } | undefined {
  const [w, h] = slices[door.slice]?.footprint ?? [1, 1];
  if (w === h) return undefined;
  // Front-edge doors stand past the floor's high edge; drawn ones in the walls at its low edges.
  return w > 1 ? { along: "x", across: "y", inward: FRONT_DOORS.has(door.slice) ? -1 : 1 } : { along: "y", across: "x", inward: FRONT_DOORS.has(door.slice) ? -1 : 1 };
}

/** A door's cells: its anchor, and the second cell its footprint reaches toward -x or -y. */
export function doorCells(slices: Record<string, SliceInfo>, door: Pick<TilePlacement, "x" | "y" | "slice">): Cell[] {
  const [w, h] = slices[door.slice]?.footprint ?? [1, 1];
  return w > 1 ? [{ x: door.x, y: door.y }, { x: door.x - 1, y: door.y }] : h > 1 ? [{ x: door.x, y: door.y }, { x: door.x, y: door.y - 1 }] : [{ x: door.x, y: door.y }];
}

/**
 * The floor right behind a door, inside its room: the look (`slice#frame`) of the floor cell next
 * to each of its cells, or undefined when one has no floor.
 */
export function floorBehind(room: RoomLayout, slices: Record<string, SliceInfo>, door: Pick<TilePlacement, "x" | "y" | "slice">): string[] | undefined {
  const axes = doorAxes(slices, door);
  if (!axes) return undefined;
  const looks: string[] = [];
  for (const c of doorCells(slices, door)) {
    const b = { ...c, [axes.across]: c[axes.across] + axes.inward };
    const ground = room.tiles.find((t) => t.kind === "ground" && t.x === b.x && t.y === b.y);
    if (!ground) return undefined;
    looks.push(`${ground.slice}#${ground.frame}`);
  }
  return looks;
}

/**
 * Whether `door` (as `original` has it) may stand at `moved` in `room`: a door with a path drawn to
 * it (anything but the room's plain floor behind it) keeps that same floor behind it; a door on
 * plain floor needs only floor behind it, so it can step onto a walkway.
 */
export function keepsPath(original: RoomLayout, room: RoomLayout, slices: Record<string, SliceInfo>, door: TilePlacement, moved: Pick<TilePlacement, "x" | "y" | "slice">): boolean {
  const after = floorBehind(room, slices, moved);
  if (!after) return false;
  const before = floorBehind(original, slices, door);
  const plain = plainFloor(original);
  return !before || before.every((l) => l === plain) || before.join() === after.join();
}

/** A room's plain floor: its most common floor look. */
function plainFloor(room: RoomLayout): string | undefined {
  const count = new Map<string, number>();
  for (const t of room.tiles) if (t.kind === "ground") count.set(`${t.slice}#${t.frame}`, (count.get(`${t.slice}#${t.frame}`) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * Positions placed door to door, breadth first from `root` (at 0,0): each room is put so that its
 * door back lines up with the door it was reached through. Doors reached later can disagree;
 * ship-check lists them. Only rooms with a door both ways are reached.
 */
export function seedPositions(rooms: readonly RoomLayout[], root: string): Positions {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  if (!byId.has(root)) fail(`unknown room ${root}`);
  const out: Positions = { [root]: { x: 0, y: 0 } };
  const queue = [root];
  while (queue.length) {
    const from = byId.get(queue.shift()!)!;
    const at = out[from.id]!;
    for (const t of from.tiles) {
      const target = t.door?.target;
      if (!target || out[target]) continue;
      const back = byId.get(target)?.tiles.find((b) => b.door?.target === from.id);
      if (!back) continue;
      out[target] = { x: at.x + t.x - back.x, y: at.y + t.y - back.y };
      queue.push(target);
    }
  }
  return out;
}

/** The table as TypeScript, one room per line, to paste over ROOM_POSITIONS. */
export function formatPositions(positions: Positions): string {
  const lines = Object.entries(positions).map(([id, { x, y }]) => `  ${id}: { x: ${x}, y: ${y} },`);
  return `export const ROOM_POSITIONS: Positions = {\n${lines.join("\n")}\n};\n`;
}

function fail(message: string): never {
  throw new Error(`room positions: ${message}`);
}
