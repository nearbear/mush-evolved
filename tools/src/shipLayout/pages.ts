// Repacks sprite sheets too big for a GPU texture into pages. Many phone GPUs can't load a texture
// over 4096 px on a side (WebGL MAX_TEXTURE_SIZE), and two of the original sheets are bigger; one
// slice (bay_window, 16 frames of 334 px) is wider than a page on its own. So each oversized
// sheet's slices are copied onto shelf-packed pages, a strip too wide for a page wrapped onto more
// rows (frameRect reads frames row-major, so their order is kept), and each slice is pointed at its
// page with its new position and grid. The page images go to Mush/derived/pages/. Planning is pure,
// so the layout's stale-check test can rerun it.

import type { ShipLayout, SliceInfo } from "@mush2/shared";
import type { Image } from "./png.ts";

/** The largest texture side every GPU we support can load. */
export const MAX_PAGE = 4096;

/** One frame-sized copy from the source sheet onto a page. */
export interface Blit {
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
}

/** A page image built from `source` (paths relative to Mush/). */
export interface Page {
  sheet: string;
  source: string;
  image: string;
  width: number;
  height: number;
  blits: Blit[];
}

/** How a slice's frames are laid out: `cols` x `rows` frames of `width` x `height`. */
function grid(s: SliceInfo, max: number) {
  const count = s.framesX * s.framesY;
  if (s.width > max || s.height > max) throw new Error(`a frame of ${s.sheet} is bigger than ${max} px`);
  if (s.framesX * s.width <= max) return { cols: s.framesX, rows: s.framesY };
  const rows = Math.ceil((count * s.width) / max);
  return { cols: Math.ceil(count / rows), rows };
}

/**
 * The layout with every sheet over `max` px replaced by its pages (in the sheet's place, named
 * `<sheet>.p<n>`), and the pages to build. Slices with the same frames share one copy.
 */
export function pageSheets(layout: ShipLayout, max = MAX_PAGE): { layout: ShipLayout; pages: Page[] } {
  const pages: Page[] = [];
  const sheets: ShipLayout["sheets"] = {};
  const slices = { ...layout.slices };
  for (const [name, sheet] of Object.entries(layout.sheets)) {
    if (sheet.width <= max && sheet.height <= max) {
      sheets[name] = sheet;
      continue;
    }
    const base = sheet.image.split("/").at(-1)!.replace(/\.png$/, "");
    const own = Object.entries(slices)
      .filter(([, s]) => s.sheet === name)
      .map(([id, s]) => ({ id, s, ...grid(s, max) }));
    // Tallest first, then widest, then by id so the result is stable.
    own.sort((a, b) => b.rows * b.s.height - a.rows * a.s.height || b.cols * b.s.width - a.cols * a.s.width || (a.id < b.id ? -1 : 1));
    const placed = new Map<string, { page: Page; x: number; y: number }>();
    let page: Page | undefined;
    let x = 0, shelfY = 0, shelfH = 0;
    const newPage = () => {
      const n = pages.filter((p) => p.source === sheet.image).length;
      page = { sheet: `${name}.p${n}`, source: sheet.image, image: `derived/pages/${base}-${n}.png`, width: 0, height: 0, blits: [] };
      pages.push(page);
      [x, shelfY, shelfH] = [0, 0, 0];
    };
    for (const { id, s, cols, rows } of own) {
      const key = `${s.x},${s.y},${s.width},${s.height},${s.framesX},${s.framesY}`;
      let at = placed.get(key);
      if (!at) {
        const [w, h] = [cols * s.width, rows * s.height];
        if (!page) newPage();
        if (x + w > max) [x, shelfY, shelfH] = [0, shelfY + shelfH, 0];
        if (shelfY + h > max) newPage();
        at = { page: page!, x, y: shelfY };
        for (let f = 0; f < s.framesX * s.framesY; f++) {
          at.page.blits.push({
            sx: s.x + (f % s.framesX) * s.width,
            sy: s.y + Math.floor(f / s.framesX) * s.height,
            dx: x + (f % cols) * s.width,
            dy: shelfY + Math.floor(f / cols) * s.height,
            width: s.width,
            height: s.height,
          });
        }
        at.page.width = Math.max(at.page.width, x + w);
        at.page.height = Math.max(at.page.height, shelfY + h);
        x += w;
        shelfH = Math.max(shelfH, h);
        placed.set(key, at);
      }
      slices[id] = { ...s, sheet: at.page.sheet, x: at.x, y: at.y, framesX: cols, framesY: rows };
    }
    for (const p of pages.filter((p) => p.source === sheet.image)) {
      sheets[p.sheet] = { image: p.image, width: p.width, height: p.height, ...(sheet.transparentColor !== undefined && { transparentColor: sheet.transparentColor }) };
    }
  }
  return { layout: { ...layout, sheets, slices }, pages };
}

/** A page's pixels, copied from its sheet's image. Unused space is transparent. */
export function buildPage(img: Image, page: Page): Image {
  const rgba = new Uint8Array(page.width * page.height * 4);
  for (const b of page.blits) {
    for (let y = 0; y < b.height; y++) {
      const from = ((b.sy + y) * img.width + b.sx) * 4;
      rgba.set(img.rgba.subarray(from, from + b.width * 4), ((b.dy + y) * page.width + b.dx) * 4);
    }
  }
  return { width: page.width, height: page.height, rgba };
}
