// The iso scene for the offline views (`npm run ship-render`, `npm run ship-top`): the client's own
// `placeScene` (web/src/iso/placement.ts) over the whole ship or as seen from one room, shifted so
// that cells are on the ship plan (`RoomLayout.at`), and the walls as the cell edges they stand on.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ShipLayout, TilePlacement } from "@mush2/shared";
import { neighborRooms, type PlacedSprite, placeScene } from "../../../web/src/iso/placement.ts";

export const MUSH = resolve(import.meta.dirname, "../../../Mush");

/** The command-line options both views take (for `parseArgs`). */
export const SCENE_OPTIONS = {
  room: { type: "string", default: "CORRIDOR_A" },
  depth: { type: "string", default: "all" },
  cells: { type: "string" },
  add: { type: "string" },
  drop: { type: "string" },
  ends: { type: "boolean", default: false },
} as const;

export interface SceneArgs {
  room?: string;
  depth?: string;
  add?: string;
  drop?: string;
}

/**
 * The ship, and the scene drawn from `room` out to `depth` (1, 2 or all). `add` puts extra wall
 * pieces in ("ROOM:slice:frame:x:y;..."), `drop` leaves sprites out ("slice:x:y;...").
 */
export function loadScene(args: SceneArgs): { ship: ShipLayout; scene: PlacedSprite[] } {
  const ship = JSON.parse(readFileSync(`${MUSH}/derived/ship-layout.json`, "utf8")) as ShipLayout;
  for (const piece of (args.add ?? "").split(";").filter(Boolean)) {
    const [id, slice, frame, x, y] = piece.split(":");
    const r = ship.rooms.find((r) => r.id === id);
    if (!r?.at || !slice || !ship.slices[slice]) throw new Error(`--add: want ROOM:slice:frame:x:y, got "${piece}"`);
    r.tiles.push({ x: Number(x) - r.at.x, y: Number(y) - r.at.y, kind: "wall", layer: 0, slice, frame: Number(frame) } as TilePlacement);
  }
  const room = ship.rooms.find((r) => r.id === (args.room ?? "CORRIDOR_A"));
  if (!room?.at) throw new Error(`--room: no room "${args.room}" on the ship plan`);
  const depth = (args.depth ?? "all") === "all" ? "all" : (Number(args.depth) as 1 | 2);
  const { x: ax, y: ay } = room.at;
  const dropped = new Set((args.drop ?? "").split(";").filter(Boolean));
  const scene = placeScene(ship, [
    { room, dx: ax, dy: ay, actors: [] },
    ...neighborRooms(ship, room, depth).map((n) => ({ ...n, dx: n.dx + ax, dy: n.dy + ay, actors: [] })),
  ]).filter((s) => !dropped.has(`${s.slice}:${s.cell.x}:${s.cell.y}`));
  return { ship, scene };
}

/** Parses `--cells=x0,y0,x1,y1`. */
export function parseCells(cells: string | undefined): [number, number, number, number] | undefined {
  if (!cells) return undefined;
  const box = cells.split(",").map(Number);
  if (box.length !== 4 || box.some(Number.isNaN)) throw new Error(`--cells: want x0,y0,x1,y1, got "${cells}"`);
  return box as [number, number, number, number];
}

/** Whether `fillGaps` added the sprite (its tile index is past the room's own tiles). */
export function isFill(ship: ShipLayout, s: PlacedSprite): boolean {
  const i = Number(s.key.split("/").pop()!.slice(1));
  return i >= (ship.rooms.find((r) => r.id === s.room)?.tiles.length ?? Infinity);
}

/**
 * A wall on a cell edge. An x edge runs from (x, y) to (x + 1, y), a y edge from (x, y) to (x, y + 1).
 * Walls stand on cell edges (a cell's anchor is its top corner): BIG_WALL_L on the cell's +x edge,
 * BIG_WALL_R on its +y edge, corner_02 on both, a door on its two cells'; COLUMN and CORNER_DECK
 * are posts on the +x+y corner. See "Walls stand on cell edges" in web/src/iso/CLAUDE.md.
 */
export interface Edge {
  axis: "x" | "y";
  a: [number, number];
  b: [number, number];
  sprite: PlacedSprite;
}

const RUNS: Record<string, string> = { BIG_WALL_L: "y", WALL_L_DECK: "y", BIG_WALL_R: "x", WALL_R_DECK: "x", corner_02: "xy" };
export const POSTS = new Set(["COLUMN", "CORNER_DECK"]);

/** The edges a sprite stands on; none for anything but walls and the doors in them. */
export function edgesOf(ship: ShipLayout, s: PlacedSprite): Edge[] {
  const { x, y } = s.cell;
  const edge = (axis: "x" | "y", ex: number, ey: number): Edge => ({ axis, a: [ex, ey], b: axis === "x" ? [ex + 1, ey] : [ex, ey + 1], sprite: s });
  if (s.kind === "wall") {
    const run = RUNS[s.slice] ?? "";
    return [...(run.includes("x") ? [edge("x", x, y + 1)] : []), ...(run.includes("y") ? [edge("y", x + 1, y)] : [])];
  }
  if (s.kind !== "door" || s.slice.startsWith("DOOR_B")) return [];
  const [w] = ship.slices[s.slice]!.footprint ?? [1, 1];
  return w > 1 ? [edge("x", x, y + 1), edge("x", x - 1, y + 1)] : [edge("y", x + 1, y), edge("y", x + 1, y - 1)];
}

/** Wall ends that touch no other wall or post, and whether there is floor beyond them. */
export function freeEnds(ship: ShipLayout, sprites: readonly PlacedSprite[]) {
  const edges = sprites.flatMap((s) => edgesOf(ship, s));
  const posts = new Set(sprites.filter((s) => s.kind === "wall" && POSTS.has(s.slice)).map((s) => `${s.cell.x + 1},${s.cell.y + 1}`));
  const touching = new Map<string, number>();
  for (const e of edges) for (const [x, y] of [e.a, e.b]) touching.set(`${x},${y}`, (touching.get(`${x},${y}`) ?? 0) + 1);
  const floor = new Set(sprites.filter((s) => s.kind === "ground").map((s) => `${s.cell.x},${s.cell.y}`));
  const out: { x: number; y: number; sprite: PlacedSprite; floorBeyond: boolean }[] = [];
  for (const e of edges) {
    for (const [p, q] of [[e.a, e.b], [e.b, e.a]] as const) {
      if (touching.get(`${p[0]},${p[1]}`) !== 1 || posts.has(`${p[0]},${p[1]}`)) continue;
      // The two cells on either side of the next edge along the line.
      const nx = p[0] < q[0] ? p[0] - 1 : p[0], ny = p[1] < q[1] ? p[1] - 1 : p[1];
      const beyond = e.axis === "y" ? [`${p[0] - 1},${ny}`, `${p[0]},${ny}`] : [`${nx},${p[1] - 1}`, `${nx},${p[1]}`];
      out.push({ x: p[0], y: p[1], sprite: e.sprite, floorBeyond: beyond.some((c) => floor.has(c)) });
    }
  }
  return out;
}

/** Prints free ends inside the cells asked for (an end is a cell corner, so up to x1 + 1, y1 + 1). */
export function listEnds(ends: ReturnType<typeof freeEnds>, box: [number, number, number, number] | undefined) {
  const [x0, y0, x1, y1] = box ?? [-Infinity, -Infinity, Infinity, Infinity];
  const inside = ends.filter((e) => e.x >= x0 && e.y >= y0 && e.x <= x1 + 1 && e.y <= y1 + 1);
  for (const e of inside) {
    const { room, slice, cell } = e.sprite;
    console.log(`${e.x},${e.y}`.padEnd(9), `${room}:${slice}@${cell.x},${cell.y}`.padEnd(48), e.floorBeyond ? "floor beyond" : "nothing beyond");
  }
  return inside;
}
