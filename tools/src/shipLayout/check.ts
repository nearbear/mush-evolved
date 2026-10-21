// Checks the ship plan (each room's `at` in ship-layout.json, from roomPositions.ts) for rooms
// drawn on top of each other, doors whose two sides don't meet, and holes between rooms.
//
//   npm run ship-check                          # report on the plan in ship-layout.json
//   npm run ship-check -- --seed CORRIDOR_C         # a fresh table placed door to door from that room, and its report
//   npm run ship-check -- --seed CORRIDOR_C --fit   # then nudge rooms (up to 4 cells) until nothing overlaps
//
// --seed starts from the converter's rooms, so it ignores the current table. Paste the table it
// prints over ROOM_POSITIONS in roomPositions.ts and run `npm run ship-layout`.
// Overlaps and doors moved off their floor paths are errors (a test fails on them). Misaligned
// doors are listed so each can be fixed on purpose; gaps are for information (fillGaps in the iso
// view patches one-cell strips).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { RoomLayout, ShipLayout } from "@mush2/shared";
import { convert } from "./convert.ts";
import { decodePng, pngSize } from "./png.ts";
import { doorCells, FRONT_DOORS, formatPositions, keepsPath, placeRooms, seedPositions, type Positions } from "./roomPositions.ts";

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

export interface DoorOffPath {
  room: string;
  /** The room the door leads to. */
  target: string;
  /** Where the original put the door, and where it is now, in the room's own cells. */
  from: [number, number];
  to: [number, number];
}

export interface ShipReport {
  /** Rooms with a door to a placed room but no position of their own. */
  unplaced: string[];
  overlaps: Overlap[];
  doors: MisalignedDoor[];
  /** Doors moved off a path drawn on the floor to them, or onto a cell with no floor behind. */
  offPath: DoorOffPath[];
  gaps: Gap[];
}

/**
 * @param original the same rooms before placing (`convert` with no positions), to tell which
 * doors moved; without it no door is checked against its path.
 */
export function checkShip(layout: Pick<ShipLayout, "rooms" | "slices">, original?: readonly RoomLayout[]): ShipReport {
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

  return { unplaced, overlaps: [...overlapMap.values()], doors, offPath: doorsOffPath(layout, original ?? []), gaps: findGaps(floor, solid) };
}

/**
 * Doors that moved (tile indices are kept, so the same index is the same door) off a path drawn
 * on the floor to them (`keepsPath`).
 */
function doorsOffPath(layout: Pick<ShipLayout, "rooms" | "slices">, original: readonly RoomLayout[]): DoorOffPath[] {
  const out: DoorOffPath[] = [];
  for (const room of layout.rooms) {
    const before = original.find((r) => r.id === room.id);
    if (!before) continue;
    room.tiles.forEach((t, i) => {
      const o = before.tiles[i];
      if (t.kind !== "door" || !o || (o.x === t.x && o.y === t.y)) return;
      // Floors as the original has them (the corridors' deck floor is painted on afterwards); placing rooms moves no floor.
      if (!keepsPath(before, before, layout.slices, o, t)) out.push({ room: room.id, target: t.door!.target, from: [o.x, o.y], to: [t.x, t.y] });
    });
  }
  return out;
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
    ...section(
      "Doors moved off their floor paths (errors)",
      report.offPath.map((d) => `${d.room} -> ${d.target}: from (${d.from.join(",")}) to (${d.to.join(",")})`),
    ),
    ...section("Doors that don't line up", report.doors.map((d) => `${d.rooms[0]} -> ${d.rooms[1]}: ${d.rooms[1]}'s side is off by ${off(d.off)}`)),
    ...section("Gaps between rooms", report.gaps.map((g) => `${g.rooms[0]} / ${g.rooms[1]}: ${cells(g.cells)}`)),
  ].join("\n");
}

/** One number for how bad a plan is: overlapping cells and doors off their paths first, then how far doors are apart, then gaps. */
export function planCost(report: ShipReport): number {
  const overlap = report.overlaps.reduce((s, o) => s + o.cells.length, 0) + report.offPath.length;
  const doors = report.doors.reduce((s, d) => s + Math.abs(d.off.x) + Math.abs(d.off.y), 0);
  const gaps = report.gaps.reduce((s, g) => s + g.cells.length, 0);
  return overlap * 100 + doors * 10 + gaps;
}

/**
 * Nudges rooms (all but `root`) one at a time, by up to `reach` cells each way, keeping any move
 * that lowers planCost, until a sweep changes nothing.
 */
export function fitPositions(layout: Pick<ShipLayout, "rooms" | "slices">, start: Positions, root: string, reach = 4): Positions {
  const cost = (p: Positions) => planCost(checkShip({ slices: layout.slices, rooms: placeRooms(layout.rooms, layout.slices, p) }, layout.rooms));
  let pos = start;
  let best = cost(pos);
  for (let improved = true; improved; ) {
    improved = false;
    for (const id of Object.keys(pos)) {
      if (id === root) continue;
      const base = pos[id]!;
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dy = -reach; dy <= reach; dy++) {
          if (!dx && !dy) continue;
          const trial = { ...pos, [id]: { x: base.x + dx, y: base.y + dy } };
          const c = cost(trial);
          if (c < best) [best, pos, improved] = [c, trial, true];
        }
      }
    }
  }
  return pos;
}

/** The converter's layout with no room positions: the rooms, doors and floors as the original has them (after stretch.ts and the walkways, before the deck floors). */
export function unplacedLayout(mush: string): ShipLayout {
  const map = decodePng(readFileSync(resolve(mush, "clients/iso/gfx/ShipMap.png")));
  const xml = readFileSync(resolve(mush, "clients/iso/xml/tiles.xml"), "utf8");
  return convert(map, xml, (image) => pngSize(readFileSync(resolve(mush, image))), { positions: {}, deck: [] });
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { seed: { type: "string" }, fit: { type: "boolean" } } });
  const mush = resolve(import.meta.dirname, "../../../Mush");
  const raw = unplacedLayout(mush);
  if (values.seed) {
    let positions = seedPositions(raw.rooms, values.seed);
    if (values.fit) positions = fitPositions(raw, positions, values.seed);
    console.log(formatPositions(positions));
    console.log(formatReport(checkShip({ ...raw, rooms: placeRooms(raw.rooms, raw.slices, positions) }, raw.rooms)));
  } else {
    if (values.fit) throw new Error("--fit needs --seed <ROOM>");
    const layout = JSON.parse(readFileSync(resolve(mush, "derived/ship-layout.json"), "utf8")) as ShipLayout;
    console.log(formatReport(checkShip(layout, raw.rooms)));
  }
}
