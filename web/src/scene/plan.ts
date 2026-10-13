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
 * Centres of `count` cells spread evenly through a room, in reading order, for
 * the people in it. Always inside the room, whatever its shape (corridors are
 * two cells wide and bend). More people than cells share cells.
 */
export function spots(runs: CellRun[], count: number): { x: number; y: number }[] {
  const cells = runs.flatMap(([x, y, n]) => Array.from({ length: n }, (_, i) => ({ x: x + i + 0.5, y: y + 0.5 })));
  if (cells.length === 0) return [];
  return Array.from({ length: count }, (_, i) => cells[Math.floor(((i + 0.5) * cells.length) / count)]!);
}
