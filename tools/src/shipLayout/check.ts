// Checks the ship map (Mush/derived/ship-map.json) for rooms drawn on top of each other, doors
// whose two sides don't meet, and holes between rooms. It only reports: fix what it finds in the map.
//
//   npm run ship-check
//
// Overlaps are errors (a test fails on them). Misaligned doors are pinned in a test so each is
// fixed on purpose; gaps are for information.

import type { RoomLayout, ShipLayout, SliceInfo, TilePlacement } from "@mush2/shared";
import { readShip } from "./shipMap.ts";

/** Doors on a room's open front edges (+x for DOOR_BR, +y for DOOR_BL): never drawn while the room behind them is. */
export const FRONT_DOORS: ReadonlySet<string> = new Set(["DOOR_BR", "DOOR_BL"]);

/** A door's cells: its anchor, and the second cell its footprint reaches toward -x or -y. */
export function doorCells(slices: Record<string, SliceInfo>, door: Pick<TilePlacement, "x" | "y" | "slice">): { x: number; y: number }[] {
  const [w, h] = slices[door.slice]?.footprint ?? [1, 1];
  return w > 1 ? [{ x: door.x, y: door.y }, { x: door.x - 1, y: door.y }] : h > 1 ? [{ x: door.x, y: door.y }, { x: door.x, y: door.y - 1 }] : [{ x: door.x, y: door.y }];
}

export interface Overlap {
  /** The room whose floor is covered, and the room covering it. */
  rooms: [string, string];
  kind: "floor" | "wall";
  /** Ship cells. */
  cells: [number, number][];
}

export interface MisalignedDoor {
  rooms: [string, string];
  /** How far the second room's door is from the first's, in cells: move the second room by minus this to line them up. */
  off: { x: number; y: number };
}

export interface Gap {
  rooms: [string, string];
  cells: [number, number][];
}

export interface ShipReport {
  /** Rooms with a door to a placed room but no position of their own. */
  unplaced: string[];
  overlaps: Overlap[];
  doors: MisalignedDoor[];
  gaps: Gap[];
}

export function checkShip(layout: Pick<ShipLayout, "rooms" | "slices">): ShipReport {
  const placed = layout.rooms.filter((r): r is RoomLayout & { at: { x: number; y: number } } => !!r.at);
  const byId = new Map(layout.rooms.map((r) => [r.id, r]));
  const key = (x: number, y: number) => `${x},${y}`;

  // Every placed room's floor and solid (wall and drawn door) cells on the ship grid.
  const floor = new Map<string, string[]>();
  const solid = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, k: string, id: string) => {
    const list = m.get(k) ?? [];
    if (!list.includes(id)) list.push(id);
    m.set(k, list);
  };
  for (const r of placed) {
    for (const t of r.tiles) {
      const x = t.x + r.at.x, y = t.y + r.at.y;
      if (t.kind === "ground") add(floor, key(x, y), r.id);
      else if (t.kind === "wall") add(solid, key(x, y), r.id);
      // A front-edge door isn't drawn once the room behind it is, so it takes up no cell.
      else if (t.kind === "door" && !FRONT_DOORS.has(t.slice)) {
        for (const c of doorCells(layout.slices, t)) add(solid, key(c.x + r.at.x, c.y + r.at.y), r.id);
      }
    }
  }

  const overlapMap = new Map<string, Overlap>();
  const overlap = (a: string, b: string, kind: Overlap["kind"], k: string) => {
    const id = `${kind}:${a}:${b}`;
    const o = overlapMap.get(id) ?? { rooms: [a, b], kind, cells: [] };
    o.cells.push(k.split(",").map(Number) as [number, number]);
    overlapMap.set(id, o);
  };
  for (const [k, ids] of floor) {
    const sorted = [...ids].sort();
    for (const [i, a] of sorted.entries()) for (const b of sorted.slice(i + 1)) overlap(a, b, "floor", k);
    for (const a of ids) for (const b of solid.get(k) ?? []) if (b !== a) overlap(a, b, "wall", k);
  }

  const doors: MisalignedDoor[] = [];
  for (const a of placed) {
    for (const t of a.tiles) {
      const b = t.door && byId.get(t.door.target);
      if (!b?.at || a.id > b.id) continue;
      const back = b.tiles.find((u) => u.door?.target === a.id);
      if (!back) continue;
      const off = { x: back.x + b.at.x - (t.x + a.at.x), y: back.y + b.at.y - (t.y + a.at.y) };
      if (off.x !== 0 || off.y !== 0) doors.push({ rooms: [a.id, b.id], off });
    }
  }

  const unplaced = layout.rooms
    .filter((r) => !r.at && r.tiles.some((t) => t.door && byId.get(t.door.target)?.at && byId.get(t.door.target)!.tiles.some((u) => u.door?.target === r.id)))
    .map((r) => r.id);

  return { unplaced, overlaps: [...overlapMap.values()], doors, gaps: findGaps(floor, solid) };
}

/**
 * Empty cells in a strip of one or two between two different rooms, along x or y, with floor on at
 * least one side: holes you could see through between rooms.
 */
function findGaps(floor: Map<string, string[]>, solid: Map<string, string[]>): Gap[] {
  const owner = (x: number, y: number) => {
    const k = `${x},${y}`;
    const f = floor.get(k)?.[0];
    return f ? { id: f, floor: true } : solid.get(k)?.[0] ? { id: solid.get(k)![0]!, floor: false } : undefined;
  };
  const cells = [...floor.keys(), ...solid.keys()].map((k) => k.split(",").map(Number) as [number, number]);
  const gapMap = new Map<string, Gap>();
  const seen = new Set<string>();
  for (const [x, y] of cells) {
    const here = owner(x, y)!;
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      // Walk up to two empty cells, then look for another room.
      for (let n = 1; n <= 2; n++) {
        if (owner(x + dx * n, y + dy * n)) break;
        const far = owner(x + dx * (n + 1), y + dy * (n + 1));
        if (!far) continue;
        if (far.id !== here.id && (far.floor || here.floor)) {
          const rooms = [here.id, far.id].sort() as [string, string];
          const g = gapMap.get(rooms.join()) ?? { rooms, cells: [] };
          for (let i = 1; i <= n; i++) {
            const c: [number, number] = [x + dx * i, y + dy * i];
            if (!seen.has(c.join())) g.cells.push(c);
            seen.add(c.join());
          }
          gapMap.set(rooms.join(), g);
        }
        break;
      }
    }
  }
  return [...gapMap.values()].filter((g) => g.cells.length > 0);
}

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
      report.overlaps.map((o) => `${o.rooms[0]} ${o.kind === "floor" ? "floor on" : "floor under the wall of"} ${o.rooms[1]}: ${cells(o.cells)}`),
    ),
    ...section("Doors that don't line up", report.doors.map((d) => `${d.rooms[0]} -> ${d.rooms[1]}: ${d.rooms[1]}'s side is off by ${off(d.off)}`)),
    ...section("Gaps between rooms", report.gaps.map((g) => `${g.rooms[0]} / ${g.rooms[1]}: ${cells(g.cells)}`)),
  ].join("\n");
}

if (import.meta.main) {
  console.log(formatReport(checkShip(readShip())));
}
