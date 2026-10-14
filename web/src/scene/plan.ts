// Pure helpers for drawing Mush/derived/ship-plan.json (the minimap's deck
// plan). No DOM: shapes come out as SVG path data in plan cells.

import type { CellRun } from "@mush2/shared";

/** One SVG path covering every run: a 1-cell-tall rectangle per run. */
export function runsPath(runs: CellRun[]): string {
  return runs.map(([x, y, n]) => `M${x} ${y}h${n}v1h${-n}z`).join("");
}

/** Path for single cells, such as a door's. */
export const cellsPath = (cells: [number, number][]) => runsPath(cells.map(([x, y]) => [x, y, 1]));

/**
 * Where to draw `count` square icons in a room so that none touches or crosses
 * a wall. The icons are as big as `maxSize` (in cells) unless the room is too
 * narrow, such as a two-cell corridor: then they shrink to the largest size
 * that fits, never below one cell (which always fits). Every icon in a room has
 * the same size. Positions are icon centres, spread evenly through the room in
 * reading order; more people than spots share spots.
 */
export function iconSpots(runs: CellRun[], count: number, maxSize: number): { size: number; spots: { x: number; y: number }[] } {
  const cells = new Set(runs.flatMap(([x, y, n]) => Array.from({ length: n }, (_, i) => `${x + i},${y}`)));
  if (cells.size === 0) return { size: maxSize, spots: [] };
  const xs = runs.flatMap(([x, , n]) => [x, x + n]);
  const ys = runs.flatMap(([, y]) => [y, y + 1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];

  // Does an icon of `size` centred here lie entirely on room cells?
  const fits = (cx: number, cy: number, size: number) => {
    const eps = 1e-9;
    for (let x = Math.floor(cx - size / 2 + eps); x < Math.ceil(cx + size / 2 - eps); x++) {
      for (let y = Math.floor(cy - size / 2 + eps); y < Math.ceil(cy + size / 2 - eps); y++) {
        if (!cells.has(`${x},${y}`)) return false;
      }
    }
    return true;
  };
  const candidates = (size: number) => {
    const found: { x: number; y: number }[] = [];
    for (let y = y0; y <= y1; y += 0.5) for (let x = x0; x <= x1; x += 0.5) if (fits(x, y, size)) found.push({ x, y });
    return found;
  };

  let size = maxSize;
  let spots = candidates(size);
  while (spots.length === 0 && size > 1) {
    size = Math.max(1, Math.round((size - 0.2) * 10) / 10);
    spots = candidates(size);
  }
  if (count === 0) return { size, spots: [] };
  return { size, spots: Array.from({ length: count }, (_, i) => spots[Math.floor(((i + 0.5) * spots.length) / count)]!) };
}
