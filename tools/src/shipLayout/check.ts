// Prints the checks on the ship map (Mush/derived/ship-map.json): rooms drawn on top of each other,
// doors whose two sides don't meet, and holes between rooms. It only reports: fix what it finds in the
// map (the editor at /editor lists these and more as you edit). The checks are in
// web/src/editor/checks.ts.
//
//   npm run ship-check
//
// Overlaps are errors (a test fails on them). Misaligned doors are pinned in a test so each is
// fixed on purpose; gaps are for information.

import { checkShip, type ShipReport } from "../../../web/src/editor/checks.ts";
import { readShip } from "./shipMap.ts";

export { checkShip };

export function formatReport(report: ShipReport): string {
  const cells = (cs: [number, number][]) => {
    const shown = cs.slice(0, 6).map(([x, y]) => `(${x},${y})`).join(" ");
    return cs.length > 6 ? `${shown} … ${cs.length} cells` : shown;
  };
  const off = ({ x, y }: { x: number; y: number }) => [x && `x ${x > 0 ? "+" : ""}${x}`, y && `y ${y > 0 ? "+" : ""}${y}`].filter(Boolean).join(", ");
  const section = (title: string, lines: string[]) => [`${title}: ${lines.length === 0 ? "none" : lines.length}`, ...lines.map((l) => `  ${l}`)];
  return [
    ...section("Rooms with doors but no position", report.unplaced),
    ...section(
      "Overlaps (errors)",
      report.overlaps.map((o) => `${o.rooms[0]} floor on ${o.rooms[1]}: ${cells(o.cells)}`),
    ),
    ...section("Doors that don't line up", report.doors.map((d) => `${d.rooms[0]} -> ${d.rooms[1]}: ${d.rooms[1]}'s side is off by ${off(d.off)}`)),
    ...section("Gaps between rooms", report.gaps.map((g) => `${g.rooms[0]} / ${g.rooms[1]}: ${cells(g.cells)}`)),
  ].join("\n");
}

if (import.meta.main) {
  console.log(formatReport(checkShip(readShip())));
}
