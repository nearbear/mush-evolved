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
import { gridToPx, type PlacedSprite } from "../../../web/src/iso/placement.ts";
import { decodePng, encodePng } from "../shipLayout/png.ts";
import { freeEnds, listEnds, loadScene, MUSH, parseCells, SCENE_OPTIONS } from "./shipScene.ts";

const { values: args } = parseArgs({
  options: {
    ...SCENE_OPTIONS,
    scale: { type: "string", default: "2" },
    out: { type: "string", default: resolve(import.meta.dirname, "../../../.screenshots/ship-render.png") },
  },
});
const { ship, scene } = loadScene(args);
const box = parseCells(args.cells);

// The picture's bounds: the cells asked for, or everything drawn.
let L: number, T: number, R: number, B: number;
if (box) {
  const [x0, y0, x1, y1] = box;
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
  for (const e of listEnds(freeEnds(ship, scene), box)) {
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
