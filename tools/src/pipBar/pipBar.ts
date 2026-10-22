// Regenerates Mush/derived/pip-bar/*.svg from www/img/design/pabar.png (CC BY-NC-SA, see Mush/ATTRIBUTION.md).
// The sprite is a vertical frame, 11x79: a 3px top cap, then slots 6px long, then a 4px bottom cap. Each piece
// is transposed to run sideways and written as <rect>s in the sprite's exact colors, so it stays crisp at any
// scale. Run with `npm run pip-bar`; a test fails if the committed files are stale.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodePng, type Image } from "../shipLayout/png.ts";

const MUSH = resolve(import.meta.dirname, "../../../Mush");
const SOURCE = resolve(MUSH, "www/img/design/pabar.png");
const OUT_DIR = resolve(MUSH, "derived/pip-bar");

/** The sprite has 12 slots of 6 rows after a 3-row cap, and fades from bright at the top to dark at the bottom. */
export const SPRITE_SLOTS = 12;
const CAP_START_ROWS = 3;
const SLOT_ROWS = 6;
const CAP_END_FROM = CAP_START_ROWS + SPRITE_SLOTS * SLOT_ROWS;

/** Source rows (the sprite's y) that become each piece's columns: the two caps, then `slot-N` for each sprite slot. */
const PIECES: Record<string, [number, number]> = {
  "cap-start": [0, CAP_START_ROWS],
  ...Object.fromEntries(
    Array.from({ length: SPRITE_SLOTS }, (_, n): [string, [number, number]] => [
      `slot-${n}`,
      [CAP_START_ROWS + n * SLOT_ROWS, CAP_START_ROWS + (n + 1) * SLOT_ROWS],
    ]),
  ),
  "cap-end": [CAP_END_FROM, CAP_END_FROM + 4],
};
/** Columns kept of a 6px slot for the 3px-wide life/morale pips: the divider, the lip, and the two rows after. */
const THIN_COLUMNS = [0, 1, 3, 5];

const hex = (v: number) => v.toString(16).padStart(2, "0");

/** One piece as an SVG: source rows `columns` (in order) laid out left to right, source x going down. */
function piece(img: Image, columns: number[]): string {
  const rects: string[] = [];
  for (let y = 0; y < img.width; y++) {
    // Merge runs of the same color along the piece's length.
    let x = 0;
    while (x < columns.length) {
      const px = (col: number) => {
        const i = (columns[col]! * img.width + y) * 4;
        return [...img.rgba.slice(i, i + 4)];
      };
      const color = px(x);
      let end = x + 1;
      while (end < columns.length && px(end).join() === color.join()) end++;
      if (color[3] !== 0) {
        const opacity = color[3] === 255 ? "" : ` opacity="${+(color[3]! / 255).toFixed(2)}"`;
        rects.push(`  <rect x="${x}" y="${y}" width="${end - x}" height="1" fill="#${hex(color[0]!)}${hex(color[1]!)}${hex(color[2]!)}"${opacity}/>`);
      }
      x = end;
    }
  }
  const w = columns.length;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${img.width}" viewBox="0 0 ${w} ${img.width}" shape-rendering="crispEdges">\n${rects.join("\n")}\n</svg>\n`;
}

/** File name to contents for every piece, including the thin slot variants (`slot-N-thin.svg`). */
export function buildPipBar(png: Uint8Array = readFileSync(SOURCE)): Record<string, string> {
  const img = decodePng(png);
  const out: Record<string, string> = {};
  for (const [name, [from, to]] of Object.entries(PIECES)) {
    const rows = Array.from({ length: to - from }, (_, i) => from + i);
    out[`${name}.svg`] = piece(img, rows);
    if (name.startsWith("slot-")) out[`${name}-thin.svg`] = piece(img, THIN_COLUMNS.map((c) => from + c));
  }
  return out;
}

export { OUT_DIR };

if (import.meta.main) {
  for (const [name, svg] of Object.entries(buildPipBar())) writeFileSync(resolve(OUT_DIR, name), svg);
}
