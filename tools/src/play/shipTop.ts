// The ship from above, as plain shapes: easier to read placements from than the iso view. It draws
// the scene the client's own `placeScene` gives on the ship plan, x to the right and y down. Turn
// it 45° clockwise and it lines up with the iso view.
//
//   npm run ship-top                                   # whole ship -> .screenshots/ship-top.png
//   npm run ship-top -- --cells=-30,10,-20,25 --cell 32    # part of the plan, bigger cells (note the =)
//   npm run ship-top -- --room LABORATORY --depth 1    # the scene as seen from one room
//   npm run ship-top -- --ends                         # also mark and list wall ends that touch nothing
//
// What's drawn (the legend is under the map):
// - Floor in each room's colour; lighter where the floor art differs from the room's usual floor
//   (walkways, paths).
// - Walls as thick lines on the cell edge they stand on (BIG_WALL_L on the cell's +x edge,
//   BIG_WALL_R on its +y edge, see web/src/iso/CLAUDE.md): grey, lilac for the bays' deck walls.
//   Doors in walls are cyan; doorways on a room's open front
//   edge (drawn only while the room behind isn't) are dashed. Posts (COLUMN) are squares on the corner.
// - Furniture and other things standing on the floor as outlines of their footprint.
// - Room names, and grid lines every 5 cells numbered along the top and left.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { PlacedSprite } from "../../../web/src/iso/placement.ts";
import { encodePng } from "../shipLayout/png.ts";
import { edgesOf, freeEnds, listEnds, loadScene, parseCells, POSTS, SCENE_OPTIONS } from "./shipScene.ts";

type RGB = [number, number, number];

const { values: args } = parseArgs({
  options: {
    ...SCENE_OPTIONS,
    cell: { type: "string", default: "16" },
    out: { type: "string", default: resolve(import.meta.dirname, "../../../.screenshots/ship-top.png") },
  },
});
const { ship, scene } = loadScene(args);
const S = Math.max(8, Math.round(Number(args.cell) / 2) * 2);

// The cells shown: the ones asked for, or everything drawn.
const cells = scene.map((s) => s.cell);
const [x0, y0, x1, y1] = parseCells(args.cells) ?? [
  Math.min(...cells.map((c) => c.x)) - 1,
  Math.min(...cells.map((c) => c.y)) - 1,
  Math.max(...cells.map((c) => c.x)) + 1,
  Math.max(...cells.map((c) => c.y)) + 1,
];
const MARGIN = { left: 36, top: 30, right: 16, bottom: 74 };
const W = MARGIN.left + (x1 - x0 + 1) * S + MARGIN.right;
const H = MARGIN.top + (y1 - y0 + 1) * S + MARGIN.bottom;
const img = new Uint8Array(W * H * 4);
const px = (x: number) => MARGIN.left + (x - x0) * S;
const py = (y: number) => MARGIN.top + (y - y0) * S;

/** Where drawing lands: the map, until the labels around it. */
let clip = { x0: MARGIN.left, y0: MARGIN.top, x1: px(x1 + 1) + 2, y1: py(y1 + 1) + 2 };
const set = (x: number, y: number, [r, g, b]: RGB, a = 1) => {
  if (x < clip.x0 || y < clip.y0 || x >= clip.x1 || y >= clip.y1) return;
  const i = (y * W + x) * 4;
  img[i] = Math.round(r * a + img[i]! * (1 - a));
  img[i + 1] = Math.round(g * a + img[i + 1]! * (1 - a));
  img[i + 2] = Math.round(b * a + img[i + 2]! * (1 - a));
  img[i + 3] = 255;
};
const rect = (x: number, y: number, w: number, h: number, c: RGB, a = 1) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c, a);
};
const outline = (x: number, y: number, w: number, h: number, c: RGB, a = 1) => {
  for (let i = 0; i < w; i++) set(x + i, y, c, a), set(x + i, y + h - 1, c, a);
  for (let j = 1; j < h - 1; j++) set(x, y + j, c, a), set(x + w - 1, y + j, c, a);
};

const SPACE: RGB = [18, 18, 36];
const WALL: RGB = [225, 228, 236], DECK: RGB = [196, 160, 236], DOOR: RGB = [70, 220, 235];
clip = { x0: 0, y0: 0, x1: W, y1: H };
rect(0, 0, W, H, SPACE);
clip = { x0: MARGIN.left - 2, y0: MARGIN.top - 2, x1: px(x1 + 1) + 2, y1: py(y1 + 1) + 2 };

// Each room's colour, from its place in the layout so it's the same in every picture.
const hue = new Map(ship.rooms.map((r, i) => [r.id, (i * 137.508) % 360]));
const hsl = (h: number, s: number, l: number): RGB => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))) as RGB;
};
// A room's usual floor: the commonest look among its own floor tiles.
const usual = new Map<string, string>();
for (const r of ship.rooms) {
  const count = new Map<string, number>();
  for (const t of r.tiles) if (t.kind === "ground") count.set(`${t.slice}#${t.frame}`, (count.get(`${t.slice}#${t.frame}`) ?? 0) + 1);
  usual.set(r.id, [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "");
}
/** The frame a sprite shows, from where its picture is in the sheet. */
const frameOf = (s: PlacedSprite) => {
  const sl = ship.slices[s.slice]!;
  return Math.round((s.sy - sl.y) / sl.height) * sl.framesX + Math.round((s.sx - sl.x) / sl.width);
};
const inView = (s: PlacedSprite) => s.cell.x >= x0 && s.cell.x <= x1 && s.cell.y >= y0 && s.cell.y <= y1;

// Floor. A cell can hold more than one floor tile (a door's doorway); the last one drawn shows.
for (const s of scene.filter((s) => s.kind === "ground" && inView(s))) {
  const plain = usual.get(s.room) === `${s.slice}#${frameOf(s)}`;
  const c = hsl(hue.get(s.room) ?? 0, 0.42, plain ? 0.3 : 0.47);
  rect(px(s.cell.x) + 1, py(s.cell.y) + 1, S - 1, S - 1, c);
}
// Grid lines every 5 cells.
for (let x = Math.ceil(x0 / 5) * 5; x <= x1 + 1; x += 5) for (let y = py(y0); y < py(y1 + 1); y++) set(px(x), y, [255, 255, 255], 0.18);
for (let y = Math.ceil(y0 / 5) * 5; y <= y1 + 1; y += 5) for (let x = px(x0); x < px(x1 + 1); x++) set(x, py(y), [255, 255, 255], 0.18);

// Furniture: the cells its footprint covers (toward -x/-y from its anchor).
for (const s of scene.filter((s) => s.kind === "entity" && inView(s))) {
  const [w, h] = ship.slices[s.slice]?.footprint ?? [1, 1];
  const c = hsl(hue.get(s.room) ?? 0, 0.5, 0.75);
  outline(px(s.cell.x - w + 1) + 3, py(s.cell.y - h + 1) + 3, w * S - 5, h * S - 5, c, 0.85);
}

// Walls and doors on their edges, then posts on their corners.
const T = Math.max(2, Math.round(S / 6));
for (const s of scene) {
  const colour = s.kind === "door" ? DOOR : s.slice.includes("DECK") ? DECK : WALL;
  for (const e of edgesOf(ship, s)) {
    const [ex, ey] = e.a;
    if (e.axis === "x") rect(px(ex), py(ey) - (T >> 1), S, T, colour);
    else rect(px(ex) - (T >> 1), py(ey), T, S, colour);
  }
  // A doorway on a room's open front edge: DOOR_BR on its cells' -x edge, DOOR_BL on their -y edge.
  if (s.kind === "door" && s.slice.startsWith("DOOR_B")) {
    const [w, h] = ship.slices[s.slice]?.footprint ?? [1, 1];
    for (let n = 0; n < Math.max(w, h); n++) {
      const [cx, cy] = s.slice === "DOOR_BR" ? [s.cell.x, s.cell.y - n] : [s.cell.x - n, s.cell.y];
      for (let i = 0; i < S; i += 4) {
        if (s.slice === "DOOR_BR") rect(px(cx) - 1, py(cy) + i, 2, 2, DOOR);
        else rect(px(cx) + i, py(cy) - 1, 2, 2, DOOR);
      }
    }
  }
  if (s.kind === "wall" && POSTS.has(s.slice)) {
    const p = T + 2;
    rect(px(s.cell.x + 1) - (p >> 1) - 1, py(s.cell.y + 1) - (p >> 1) - 1, p + 2, p + 2, SPACE);
    rect(px(s.cell.x + 1) - (p >> 1), py(s.cell.y + 1) - (p >> 1), p, p, s.slice === "CORNER_DECK" ? DECK : WALL);
  }
}

// Wall ends that touch nothing.
if (args.ends) {
  for (const e of listEnds(freeEnds(ship, scene), parseCells(args.cells))) {
    outline(px(e.x) - 5, py(e.y) - 5, 11, 11, e.floorBeyond ? [255, 140, 0] : [255, 0, 255]);
    outline(px(e.x) - 4, py(e.y) - 4, 9, 9, e.floorBeyond ? [255, 140, 0] : [255, 0, 255]);
  }
}

// Text: a 3x5 pixel font, drawn at 2x. Each glyph is five rows of three, top to bottom.
const FONT: Record<string, string> = {
  A: ".#. #.# ### #.# #.#", B: "##. #.# ##. #.# ##.", C: ".## #.. #.. #.. .##", D: "##. #.# #.# #.# ##.",
  E: "### #.. ##. #.. ###", F: "### #.. ##. #.. #..", G: ".## #.. #.# #.# .##", H: "#.# #.# ### #.# #.#",
  I: "### .#. .#. .#. ###", J: "..# ..# ..# #.# .#.", K: "#.# #.# ##. #.# #.#", L: "#.. #.. #.. #.. ###",
  M: "#.# ### #.# #.# #.#", N: "##. #.# #.# #.# #.#", O: ".#. #.# #.# #.# .#.", P: "##. #.# ##. #.. #..",
  Q: ".#. #.# #.# ##. .##", R: "##. #.# ##. #.# #.#", S: ".## #.. .#. ..# ##.", T: "### .#. .#. .#. .#.",
  U: "#.# #.# #.# #.# ###", V: "#.# #.# #.# #.# .#.", W: "#.# #.# #.# ### #.#", X: "#.# #.# .#. #.# #.#",
  Y: "#.# #.# .#. .#. .#.", Z: "### ..# .#. #.. ###", "0": "### #.# #.# #.# ###", "1": ".#. ##. .#. .#. ###",
  "2": "##. ..# .#. #.. ###", "3": "##. ..# .#. ..# ##.", "4": "#.# #.# ### ..# ..#",
  "5": "### #.. ##. ..# ##.", "6": ".## #.. ### #.# ###", "7": "### ..# .#. .#. .#.",
  "8": "### #.# ### #.# ###", "9": "### #.# ### ..# ##.", "-": "... ... ### ... ...",
  ",": "... ... ... .#. #..", ".": "... ... ... ... .#.", "'": ".#. .#. ... ... ...",
  "(": ".#. #.. #.. #.. .#.", ")": ".#. ..# ..# ..# .#.", "=": "... ### ... ### ...",
  " ": "... ... ... ... ...",
};
const glyph = (ch: string) => (FONT[ch] ?? FONT[" "]!).replaceAll(" ", "");
const textWidth = (t: string) => t.length * 8 - 2;
const text = (t: string, x: number, y: number, c: RGB = [255, 255, 255], shadow = true) => {
  [...t.toUpperCase()].forEach((ch, n) => {
    const g = glyph(ch);
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 3; i++) {
        if (g[j * 3 + i] !== "#") continue;
        if (shadow) rect(x + n * 8 + i * 2 + 1, y + j * 2 + 1, 2, 2, [0, 0, 0], 0.8);
        rect(x + n * 8 + i * 2, y + j * 2, 2, 2, c);
      }
    }
  });
};

// Room names, in the middle of each room's own floor.
for (const r of ship.rooms) {
  const own = scene.filter((s) => s.room === r.id && s.kind === "ground" && inView(s));
  if (!own.length) continue;
  const cx = own.reduce((a, s) => a + s.cell.x, 0) / own.length + 0.5, cy = own.reduce((a, s) => a + s.cell.y, 0) / own.length + 0.5;
  const words = r.label.split(" ");
  // Two lines when the name is wider than the room.
  const width = Math.max(...own.map((s) => s.cell.x)) - Math.min(...own.map((s) => s.cell.x)) + 1;
  const lines = textWidth(r.label) > width * S && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [r.label];
  lines.forEach((l, i) => {
    text(l, Math.round(px(x0) + (cx - x0) * S - textWidth(l) / 2), Math.round(py(y0) + (cy - y0) * S - lines.length * 7 + i * 14));
  });
}

clip = { x0: 0, y0: 0, x1: W, y1: H };

// Coordinates along the top and left, and which way is which.
for (let x = Math.ceil(x0 / 5) * 5; x <= x1; x += 5) text(String(x), px(x) - textWidth(String(x)) / 2, MARGIN.top - 14, [170, 170, 190], false);
for (let y = Math.ceil(y0 / 5) * 5; y <= y1; y += 5) text(String(y), MARGIN.left - 4 - textWidth(String(y)), py(y) - 5, [170, 170, 190], false);
text("x", W - MARGIN.right - 10, MARGIN.top - 14, [170, 170, 190], false);
text("y", 4, H - MARGIN.bottom - 12, [170, 170, 190], false);

// Legend.
let lx = MARGIN.left;
const ly = H - MARGIN.bottom + 14;
const key = (swatch: (x: number, y: number) => void, label: string) => {
  swatch(lx, ly);
  text(label, lx + 22, ly, [210, 210, 220], false);
  lx += 22 + textWidth(label) + 18;
};
key((x, y) => rect(x, y + 4, 16, T, WALL), "wall");
key((x, y) => rect(x, y + 4, 16, T, DECK), "deck wall");
key((x, y) => rect(x, y + 4, 16, T, DOOR), "door");
key((x, y) => {
  for (let i = 0; i < 16; i += 4) rect(x + i, y + 4, 2, 2, DOOR);
}, "front doorway");
key((x, y) => rect(x + 5, y + 1, 7, 7, WALL), "post");
key((x, y) => rect(x, y - 2, 16, 14, hsl(200, 0.42, 0.3)), "floor");
key((x, y) => rect(x, y - 2, 16, 14, hsl(200, 0.42, 0.47)), "other floor art");
key((x, y) => outline(x, y - 2, 16, 14, hsl(200, 0.5, 0.75)), "furniture");
text("bridge (front) at low x, alpha at low y. turn 45 deg clockwise for the iso view.", MARGIN.left, ly + 22, [150, 150, 170], false);

mkdirSync(dirname(args.out!), { recursive: true });
writeFileSync(args.out!, encodePng({ width: W, height: H, rgba: img }));
console.log(`${args.room} (depth ${args.depth}), cells ${x0},${y0} to ${x1},${y1}: ${W}x${H} -> ${args.out}`);
