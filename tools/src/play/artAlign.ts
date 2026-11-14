// Measures how the art lines up with the grid, in pixels, so alignment is read from numbers rather
// than judged from screenshots (web/src/iso/CLAUDE.md, "Directions" and "Walls stand on cell edges").
// It runs the client's own `placeScene` over the whole ship, then for each sprite reads its opaque
// pixels from the atlas:
//
// - walls and doors: where the base of the art (its lowest opaque pixel in each column) sits against
//   the cell edge it stands on (`base`: + is below the edge on screen, so toward the room in front),
//   and how far the art reaches past each end of that edge, in screen columns (`past -end`/`past +end`:
//   + is past it, - is short of it). Ends are named along the wall's run: the -x/-y end is up-left
//   for a main-axis wall and up-right for a cross-axis one.
// - floors: the opaque diamond's corners against the cell's diamond (top, right, bottom, left).
//
//   npm run art-align                 # every slice, grouped by axis
//   npm run art-align -- --slice BIG_WALL_L --each   # one slice, every placement
//
// Numbers are medians over every placement of a slice (and frame, for floors).

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { gridToPx, type PlacedSprite } from "../../../web/src/iso/placement.ts";
import { decodePng } from "../shipLayout/png.ts";
import { edgesOf, loadScene, MUSH } from "./shipScene.ts";

const { values: args } = parseArgs({ options: { slice: { type: "string" }, each: { type: "boolean", default: false } } });
const { ship, scene } = loadScene({ depth: "all" });

const sheets = new Map<string, { png: ReturnType<typeof decodePng>; clear?: number[] }>();
function sheet(id: string) {
  let s = sheets.get(id);
  if (!s) {
    const info = ship.sheets[id]!;
    const clear = info.transparentColor ? [0, 2, 4].map((o) => Number.parseInt(info.transparentColor!.slice(o, o + 2), 16)) : undefined;
    s = { png: decodePng(readFileSync(`${MUSH}/${info.image}`)), ...(clear && { clear }) };
    sheets.set(id, s);
  }
  return s;
}

/** The sprite's opaque pixels by screen column: [top, bottom] in screen pixels. */
function columns(s: PlacedSprite): Map<number, [number, number]> {
  const { png, clear } = sheet(s.sheet);
  const cols = new Map<number, [number, number]>();
  for (let x = 0; x < s.width; x++) {
    for (let y = 0; y < s.height; y++) {
      const si = ((s.sy + (s.flipY ? s.height - 1 - y : y)) * png.width + s.sx + (s.flipX ? s.width - 1 - x : x)) * 4;
      const a = png.rgba[si + 3]!;
      if (a < 128 || (clear && png.rgba[si] === clear[0] && png.rgba[si + 1] === clear[1] && png.rgba[si + 2] === clear[2])) continue;
      const X = Math.round(s.left) + x, Y = Math.round(s.top) + y;
      const c = cols.get(X);
      cols.set(X, c ? [Math.min(c[0], Y), Math.max(c[1], Y + 1)] : [Y, Y + 1]);
    }
  }
  return cols;
}

const median = (xs: number[]) => {
  if (!xs.length) return Number.NaN;
  const v = [...xs].sort((a, b) => a - b);
  return v.length % 2 ? v[(v.length - 1) / 2]! : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2;
};

interface Row { group: string; key: string; values: Record<string, number>; where: string }
const rows: Row[] = [];

for (const s of scene) {
  if (args.slice && s.slice !== args.slice) continue;
  const where = `${s.room} (${s.cell.x},${s.cell.y})`;
  if (s.kind === "ground") {
    const cols = columns(s);
    if (!cols.size) continue;
    const { x, y } = s.cell;
    const top = gridToPx(x, y), right = gridToPx(x + 1, y), bottom = gridToPx(x + 1, y + 1), left = gridToPx(x, y + 1);
    const xs = [...cols.keys()];
    const minY = Math.min(...[...cols.values()].map((c) => c[0]));
    const maxY = Math.max(...[...cols.values()].map((c) => c[1]));
    rows.push({
      group: "floor",
      key: `${s.slice}#${s.sy}:${s.sx}`,
      // + is outward from the diamond's centre: up for top, right for right, down for bottom, left for left.
      values: { top: top.y - minY, right: Math.max(...xs) + 1 - right.x, bottom: maxY - bottom.y, left: left.x - Math.min(...xs) },
      where,
    });
    continue;
  }
  const edges = edgesOf(ship, s);
  if (!edges.length) continue;
  const axis = edges[0]!.axis;
  // The edges a wall or door stands on all lie on one line; take it end to end.
  const pts = edges.flatMap((e) => [e.a, e.b]).map(([ex, ey]) => gridToPx(ex, ey));
  const lo = pts.reduce((m, p) => (p.x < m.x ? p : m)), hi = pts.reduce((m, p) => (p.x > m.x ? p : m));
  const lineY = (X: number) => lo.y + ((X - lo.x) * (hi.y - lo.y)) / (hi.x - lo.x);
  const cols = columns(s);
  const base: number[] = [];
  for (const [X, [, bottom]] of cols) if (X >= lo.x && X < hi.x) base.push(bottom - lineY(X + 0.5));
  const xs = [...cols.keys()];
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs) + 1];
  // Along x the -x end is on the left of the screen; along y the -y end is on the right.
  const minusEnd = axis === "x" ? lo.x - minX : maxX - hi.x;
  const plusEnd = axis === "x" ? maxX - hi.x : lo.x - minX;
  rows.push({
    group: edges.length > 1 && s.kind === "wall" ? "corner" : axis === "x" ? "main axis (along x)" : "cross axis (along y)",
    key: `${s.slice}${s.flipX ? " flipX" : ""}`,
    values: { base: median(base), "past -end": minusEnd, "past +end": plusEnd },
    where,
  });
}

const groups = [...new Set(rows.map((r) => r.group))].sort();
for (const g of groups) {
  console.log(`\n${g}`);
  const inGroup = rows.filter((r) => r.group === g);
  const keys = [...new Set(inGroup.map((r) => r.key))].sort();
  for (const k of keys) {
    const rs = inGroup.filter((r) => r.key === k);
    const names = Object.keys(rs[0]!.values);
    const cells = names.map((n) => {
      const vs = rs.map((r) => r.values[n]!).filter((v) => !Number.isNaN(v));
      const [mn, md, mx] = [Math.min(...vs), median(vs), Math.max(...vs)];
      return `${n} ${md}${mn !== mx ? ` [${mn}..${mx}]` : ""}`;
    });
    console.log(`  ${k.padEnd(28)} x${String(rs.length).padEnd(4)} ${cells.join("   ")}`);
    if (args.each) for (const r of rs) console.log(`      ${r.where.padEnd(32)} ${names.map((n) => `${n} ${r.values[n]}`).join("   ")}`);
  }
}
