// Draws the iso scene offline, straight from the atlases: no browser, no dev server, no fog, and no
// camera following a randomly placed character, so the same arguments always give the same image.
// It runs the client's own `placeScene` (web/src/iso/placement.ts), so it shows what the game
// draws, minus people, effects and animation. Made for checking how walls join (web/src/iso/CLAUDE.md).
//
//   npm run ship-render                                  # whole ship -> .screenshots/ship-render.png
//   npm run ship-render -- --cells=-30,10,-20,25 --scale 4   # zoom on part of the ship plan (note the =)
//   npm run ship-render -- --ends                        # mark wall ends that touch nothing, and list them
//   npm run ship-render -- --room LABORATORY --depth 1   # the scene as seen from one room
//   npm run ship-render -- --add "STORAGE_FRONT:BIG_WALL_R:1:-2:11" --drop "COLUMN:-24:22"   # try pieces
//
// Cells are on the ship plan (`RoomLayout.at`), as `npm run ship-check` and the tests print them.
// With --ends, magenta marks an end with no floor beyond it (an open front edge or the hull, usually
// fine), orange one with floor beyond (look at it).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { ShipLayout, TilePlacement } from "@mush2/shared";
import { gridToPx, neighborRooms, type PlacedSprite, placeScene } from "../../../web/src/iso/placement.ts";
import { decodePng, encodePng } from "../shipLayout/png.ts";

const MUSH = resolve(import.meta.dirname, "../../../Mush");
const { values: args } = parseArgs({
  options: {
    room: { type: "string", default: "CORRIDOR_A" },
    depth: { type: "string", default: "all" },
    cells: { type: "string" },
    scale: { type: "string", default: "2" },
    out: { type: "string", default: resolve(import.meta.dirname, "../../../.screenshots/ship-render.png") },
    ends: { type: "boolean", default: false },
    add: { type: "string" },
    drop: { type: "string" },
  },
});

const ship = JSON.parse(readFileSync(`${MUSH}/derived/ship-layout.json`, "utf8")) as ShipLayout;
for (const piece of (args.add ?? "").split(";").filter(Boolean)) {
  const [id, slice, frame, x, y] = piece.split(":");
  const r = ship.rooms.find((r) => r.id === id);
  if (!r?.at || !slice || !ship.slices[slice]) throw new Error(`--add: want ROOM:slice:frame:x:y, got "${piece}"`);
  r.tiles.push({ x: Number(x) - r.at.x, y: Number(y) - r.at.y, kind: "wall", layer: 0, slice, frame: Number(frame) } as TilePlacement);
}
const room = ship.rooms.find((r) => r.id === args.room);
if (!room?.at) throw new Error(`--room: no room "${args.room}" on the ship plan`);
const depth = args.depth === "all" ? "all" : (Number(args.depth) as 1 | 2);
const { x: ax, y: ay } = room.at;
// Shifted so that cells are on the ship plan.
const dropped = new Set((args.drop ?? "").split(";").filter(Boolean));
const scene = placeScene(ship, [
  { room, dx: ax, dy: ay, actors: [] },
  ...neighborRooms(ship, room, depth).map((n) => ({ ...n, dx: n.dx + ax, dy: n.dy + ay, actors: [] })),
]).filter((s) => !dropped.has(`${s.slice}:${s.cell.x}:${s.cell.y}`));

// The picture's bounds: the cells asked for, or everything drawn.
let L: number, T: number, R: number, B: number;
if (args.cells) {
  const [x0, y0, x1, y1] = args.cells.split(",").map(Number) as [number, number, number, number];
  const corners = [gridToPx(x0, y0), gridToPx(x1 + 1, y0), gridToPx(x0, y1 + 1), gridToPx(x1 + 1, y1 + 1)];
  // Walls stand up to 80 px above their cells.
  [L, R] = [Math.min(...corners.map((c) => c.x)) - 24, Math.max(...corners.map((c) => c.x)) + 24];
  [T, B] = [Math.min(...corners.map((c) => c.y)) - 80, Math.max(...corners.map((c) => c.y)) + 16];
} else {
  [L, T] = [Math.min(...scene.map((s) => s.left)) - 8, Math.min(...scene.map((s) => s.top)) - 8];
  [R, B] = [Math.max(...scene.map((s) => s.left + s.width)) + 8, Math.max(...scene.map((s) => s.top + s.height)) + 8];
}
[L, T, R, B] = [Math.floor(L), Math.floor(T), Math.ceil(R), Math.ceil(B)];
const W = R - L, H = B - T;
const img = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) img.set([24, 22, 64, 255], i * 4);

const sheets = new Map<string, { png: ReturnType<typeof decodePng>; clear?: number[] }>();
const sheet = (id: string) => {
  let s = sheets.get(id);
  if (!s) {
    const info = ship.sheets[id]!;
    const clear = info.transparentColor ? [0, 2, 4].map((o) => Number.parseInt(info.transparentColor!.slice(o, o + 2), 16)) : undefined;
    s = { png: decodePng(readFileSync(`${MUSH}/${info.image}`)), ...(clear && { clear }) };
    sheets.set(id, s);
  }
  return s;
};
const draw = (s: PlacedSprite) => {
  const { png, clear } = sheet(s.sheet);
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      const si = ((s.sy + (s.flipY ? s.height - 1 - y : y)) * png.width + s.sx + (s.flipX ? s.width - 1 - x : x)) * 4;
      const a = png.rgba[si + 3]!;
      if (!a || (clear && png.rgba[si] === clear[0] && png.rgba[si + 1] === clear[1] && png.rgba[si + 2] === clear[2])) continue;
      const dx = Math.round(s.left) + x - L, dy = Math.round(s.top) + y - T;
      if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
      const di = (dy * W + dx) * 4;
      for (let c = 0; c < 3; c++) img[di + c] = Math.round((png.rgba[si + c]! * a + img[di + c]! * (255 - a)) / 255);
    }
  }
};
for (const s of [...scene].sort((a, b) => a.order - b.order)) if (s.sheet) draw(s);

if (args.ends) {
  // Only those in the cells asked for (an end is a cell corner, so up to x1 + 1, y1 + 1).
  const [x0, y0, x1, y1] = args.cells ? args.cells.split(",").map(Number) : [-Infinity, -Infinity, Infinity, Infinity];
  const inside = (e: { x: number; y: number }) => e.x >= x0! && e.y >= y0! && e.x <= x1! + 1 && e.y <= y1! + 1;
  for (const e of freeEnds(scene).filter(inside)) {
    console.log(`${e.x},${e.y}`.padEnd(9), `${e.room}:${e.slice}@${e.cell}`.padEnd(48), e.floorBeyond ? "floor beyond" : "nothing beyond");
    const p = gridToPx(e.x, e.y);
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 3) continue;
        const px = Math.round(p.x) + dx - L, py = Math.round(p.y) + dy - T;
        if (px >= 0 && py >= 0 && px < W && py < H) img.set(e.floorBeyond ? [255, 140, 0, 255] : [255, 0, 255, 255], (py * W + px) * 4);
      }
    }
  }
}

const k = Math.max(1, Math.round(Number(args.scale)));
const big = new Uint8Array(W * k * H * k * 4);
for (let y = 0; y < H * k; y++) {
  for (let x = 0; x < W * k; x++) {
    const si = (Math.floor(y / k) * W + Math.floor(x / k)) * 4;
    big.set(img.subarray(si, si + 4), (y * W * k + x) * 4);
  }
}
mkdirSync(dirname(args.out!), { recursive: true });
writeFileSync(args.out!, encodePng({ width: W * k, height: H * k, rgba: big }));
console.log(`${args.room} (depth ${args.depth}): ${W * k}x${H * k} -> ${args.out}`);

/**
 * Wall ends that touch no other wall or post. Walls stand on cell edges: BIG_WALL_L on the cell's
 * +x edge, BIG_WALL_R on its +y edge, corner_02 on both, a door on its two cells'; COLUMN and
 * CORNER_DECK are posts on the +x+y corner (see "Walls stand on cell edges" in web/src/iso/CLAUDE.md).
 */
function freeEnds(sprites: readonly PlacedSprite[]) {
  const RUNS: Record<string, string> = { BIG_WALL_L: "y", WALL_L_DECK: "y", BIG_WALL_R: "x", WALL_R_DECK: "x", corner_02: "xy" };
  const edges: { a: [number, number]; b: [number, number]; axis: "x" | "y"; s: PlacedSprite }[] = [];
  const posts = new Set<string>();
  for (const s of sprites) {
    const { x, y } = s.cell;
    const edge = (axis: "x" | "y", ex: number, ey: number) => edges.push({ a: [ex, ey], b: axis === "x" ? [ex + 1, ey] : [ex, ey + 1], axis, s });
    if (s.kind === "wall") {
      if (s.slice === "COLUMN" || s.slice === "CORNER_DECK") posts.add(`${x + 1},${y + 1}`);
      if (RUNS[s.slice]?.includes("x")) edge("x", x, y + 1);
      if (RUNS[s.slice]?.includes("y")) edge("y", x + 1, y);
    } else if (s.kind === "door" && !s.slice.startsWith("DOOR_B")) {
      const [w] = ship.slices[s.slice]!.footprint ?? [1, 1];
      if (w > 1) edge("x", x, y + 1), edge("x", x - 1, y + 1);
      else edge("y", x + 1, y), edge("y", x + 1, y - 1);
    }
  }
  const touching = new Map<string, number>();
  for (const e of edges) for (const [x, y] of [e.a, e.b]) touching.set(`${x},${y}`, (touching.get(`${x},${y}`) ?? 0) + 1);
  const floor = new Set(sprites.filter((s) => s.kind === "ground").map((s) => `${s.cell.x},${s.cell.y}`));
  const out: { x: number; y: number; room: string; slice: string; cell: string; floorBeyond: boolean }[] = [];
  for (const e of edges) {
    for (const [p, q] of [[e.a, e.b], [e.b, e.a]] as const) {
      if (touching.get(`${p[0]},${p[1]}`) !== 1 || posts.has(`${p[0]},${p[1]}`)) continue;
      // The two cells on either side of the next edge along the line.
      const nx = p[0] < q[0] ? p[0] - 1 : p[0], ny = p[1] < q[1] ? p[1] - 1 : p[1];
      const beyond = e.axis === "y" ? [`${p[0] - 1},${ny}`, `${p[0]},${ny}`] : [`${nx},${p[1] - 1}`, `${nx},${p[1]}`];
      out.push({ x: p[0], y: p[1], room: e.s.room, slice: e.s.slice, cell: `${e.s.cell.x},${e.s.cell.y}`, floorBeyond: beyond.some((c) => floor.has(c)) });
    }
  }
  return out;
}
