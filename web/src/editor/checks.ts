// Checks on the ship map: rooms drawn on top of each other, doors whose two sides don't meet, doors with
// no floor under them or no way back, equipment with no tile to draw it, walls stopping just short of
// another room's, and holes between rooms. Pure. `npm run ship-check` prints `checkShip`'s part, tests
// pin what is left on purpose, and the editor lists all of it as you edit (checks.worker.ts), so a
// problem can be clicked and fixed where it is.

import type { RoomLayout, ShipLayout, SliceInfo, TilePlacement } from "@mush2/shared";
// By module, not the package's index: the index imports ship-rooms.json, which plain Node (`npm run
// ship-check`) can't load without an import attribute.
import { EQUIPMENT_TYPES } from "@mush2/shared/src/equipment.ts";
import { placedEquipment } from "@mush2/shared/src/shipLayout.ts";
import { neighborRooms, placeScene } from "../iso/placement.ts";
import type { TileAt } from "./edits.ts";
import type { ShipView } from "./shipScene.ts";

/** Doors on a room's open front edges (+x for DOOR_BR, +y for DOOR_BL): never drawn while the room behind them is. */
export const FRONT_DOORS: ReadonlySet<string> = new Set(["DOOR_BR", "DOOR_BL"]);

/** A door's cells: its anchor, and the second cell its footprint reaches toward -x or -y. */
export function doorCells(slices: Record<string, SliceInfo>, door: Pick<TilePlacement, "x" | "y" | "slice">): { x: number; y: number }[] {
  const [w, h] = slices[door.slice]?.footprint ?? [1, 1];
  return w > 1 ? [{ x: door.x, y: door.y }, { x: door.x - 1, y: door.y }] : h > 1 ? [{ x: door.x, y: door.y }, { x: door.x, y: door.y - 1 }] : [{ x: door.x, y: door.y }];
}

/**
 * Doors whose two sides don't meet, left as they are for now (tools/tests/shipLayout/check.test.ts
 * fails when this list and the map disagree: fix one, then take it off).
 */
export const KNOWN_MISALIGNED: readonly string[] = [
  "MOTOR_ROOM -> SPACESHIP_BAY_AA -2,0",
  "LASER_TURRET_A_1 -> SPACESHIP_BAY_A 0,1",
  "LASER_TURRET_A_1 -> STORAGE_FRONT -1,0",
  "LASER_TURRET_A_2 -> MOTOR_ROOM 2,0",
  "LASER_TURRET_B_1 -> SICK_BAY -1,0",
  "LASER_TURRET_B_1 -> SPACESHIP_BAY_B 0,-1",
  "ICARUS -> MOTOR_ROOM 1,0",
];

/**
 * Wall ends left stopping short on purpose, by room and end ("ROOM x,y", on the ship plan, so moving a
 * room changes them), with why. web/tests/iso/placement.test.ts fails on any other.
 */
export const KNOWN_WALL_ENDS: Readonly<Record<string, string>> = {
  "LASER_TURRET_A_0 -34,18": "under the bridge's consoles",
  "LASER_TURRET_A_1 -1,6": "behind Bay Alpha's deck wall, which carries on past it",
  "CORRIDOR_A -2,23": "a sprinkler is mounted on the centre corridor's wall where it would go",
  "LASER_TURRET_A_2 42,12": "behind the motor room's door",
  "CORRIDOR_B -1,37": "behind Bay Beta's deck wall, and a camera is where it would go",
  "LASER_TURRET_B_1 -1,39": "behind Bay Beta's deck wall, which carries on past it",
  "STORAGE_B_0 4,37": "behind Bay Beta's deck wall, which carries on past it",
  "BEDROOM_B 12,37": "behind Bay Beta's deck wall, which carries on past it",
  "MOTOR_ROOM 39,37": "behind the Icarus bay's deck wall, which carries on past it",
  "STORAGE_B_1 27,37": "the Icarus bay's deck corner post stands where it would go, and covers it",
  // Since the map was frozen (2026-10-21): the sick bay's back wall closes this from the whole ship, but the
  // sick bay isn't drawn from the centre corridor at fog depth 1. To fix by hand in the map.
  "CORRIDOR_A -4,28": "the sick bay's wall closes it; a gap from the centre corridor at fog depth 1 (to fix)",
  "CORRIDOR_B -2,28": "the sick bay's wall closes it; a gap from the centre corridor at fog depth 1 (to fix)",
};

/** Whether the editor lists loose wall ends. Off since 2026-10-24: the list was noisy. wallEnds and its test still run. */
export const WALL_CHECKS = false;

export interface Overlap {
  /** The room whose floor is covered, and the room covering it. */
  rooms: [string, string];
  kind: "floor";
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

type Placed = RoomLayout & { at: { x: number; y: number } };
const isPlaced = (r: RoomLayout): r is Placed => !!r.at;

export function checkShip(layout: Pick<ShipLayout, "rooms" | "slices">): ShipReport {
  const placed = layout.rooms.filter(isPlaced);
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

export interface WallEnd {
  room: string;
  /** The loose end: a cell corner on the ship plan (a cell's anchor is its top corner). */
  end: [number, number];
  /** How many edges short of the other room's wall it stops (1 or 2). */
  short: number;
  /** The rooms whose wall it stops short of. */
  others: string[];
  /** Seen from this room, at this fog depth. */
  from: string;
  depth: 1 | "all";
}

const RUNS: Record<string, string> = { BIG_WALL_L: "y", WALL_L_DECK: "y", BIG_WALL_R: "x", WALL_R_DECK: "x", corner_02: "xy" };

/**
 * Wall ends that stop just short of another room's wall, as the game draws the ship from each room at
 * fog depth 1 and at every depth. Walls stand on cell edges: BIG_WALL_L on the cell's +x edge,
 * BIG_WALL_R on its +y edge, corner_02 on both, a door on its two cells' edges, and a COLUMN is a post
 * on the +x+y corner. A wall end that touches no other wall or post is a gap when another room's wall is
 * within two edges along its line. A wall stopping with nothing in reach is fine: the open front edges
 * (the Bravo side of most rooms) and the hull.
 */
export function wallEnds(ship: ShipLayout): WallEnd[] {
  const found: WallEnd[] = [];
  for (const r of ship.rooms.filter(isPlaced)) {
    for (const depth of [1, "all"] as const) {
      const { x: ax, y: ay } = r.at;
      const scene = placeScene(ship, [
        { room: r, dx: ax, dy: ay, actors: [] },
        ...neighborRooms(ship, r, depth).map((n) => ({ ...n, dx: n.dx + ax, dy: n.dy + ay, actors: [] })),
      ]);
      const edges: { a: [number, number]; b: [number, number]; room: string }[] = [];
      const rooms = new Map<string, Set<string>>();
      const mark = ([x, y]: [number, number], room: string) => rooms.set(`${x},${y}`, (rooms.get(`${x},${y}`) ?? new Set()).add(room));
      for (const s of scene) {
        const { x, y } = s.cell;
        const edge = (axis: "x" | "y", ex: number, ey: number) => edges.push({ a: [ex, ey], b: axis === "x" ? [ex + 1, ey] : [ex, ey + 1], room: s.room });
        if (s.kind === "wall") {
          if (s.slice === "COLUMN" || s.slice === "CORNER_DECK") mark([x + 1, y + 1], s.room);
          if (RUNS[s.slice]?.includes("x")) edge("x", x, y + 1);
          if (RUNS[s.slice]?.includes("y")) edge("y", x + 1, y);
        } else if (s.kind === "door" && !s.slice.startsWith("DOOR_B")) {
          const [w] = ship.slices[s.slice]!.footprint ?? [1, 1];
          if (w > 1) edge("x", x, y + 1), edge("x", x - 1, y + 1);
          else edge("y", x + 1, y), edge("y", x + 1, y - 1);
        }
      }
      const touching = new Map<string, number>();
      for (const e of edges) for (const [x, y] of [e.a, e.b]) touching.set(`${x},${y}`, (touching.get(`${x},${y}`) ?? 0) + 1);
      const posts = new Set(rooms.keys());
      for (const e of edges) for (const [x, y] of [e.a, e.b]) mark([x, y], e.room);
      for (const e of edges) {
        for (const [p, q] of [[e.a, e.b], [e.b, e.a]] as const) {
          if (touching.get(`${p[0]},${p[1]}`) !== 1 || posts.has(`${p[0]},${p[1]}`)) continue;
          for (let n = 1; n <= 2; n++) {
            const there = rooms.get(`${p[0] + (p[0] - q[0]) * n},${p[1] + (p[1] - q[1]) * n}`);
            if (!there) continue;
            if ([...there].some((o) => o !== e.room)) found.push({ room: e.room, end: [p[0], p[1]], short: n, others: [...there], from: r.id, depth });
            break;
          }
        }
      }
    }
  }
  return found;
}

export type Severity = "error" | "warning" | "info";

/** One thing the editor lists, with where to go to fix it. */
export interface Problem {
  /** Stable while the problem lasts (for React keys and keeping the one you picked). */
  id: string;
  severity: Severity;
  /** What it is, in a few words. */
  title: string;
  detail?: string;
  /** Why it is left as it is, when a test pins it. */
  known?: string;
  /** Ship cells to show (the first is where to look). */
  cells: [number, number][];
  room?: string;
  tile?: TileAt;
  /** The view it shows in, when it doesn't show from the whole ship. */
  view?: ShipView;
}

export const SEVERITIES: readonly Severity[] = ["error", "warning", "info"];

/** Every problem on the map, errors first. */
export function problems(ship: ShipLayout): Problem[] {
  const out: Problem[] = [];
  const byId = new Map(ship.rooms.map((r) => [r.id, r]));
  const report = checkShip(ship);
  const doorTile = (room: string, target: string): TileAt | undefined => {
    const index = byId.get(room)?.tiles.findIndex((t) => t.door?.target === target) ?? -1;
    return index < 0 ? undefined : { room, index };
  };
  const shipCell = (r: Placed, t: { x: number; y: number }): [number, number] => [t.x + r.at.x, t.y + r.at.y];

  for (const id of report.unplaced) out.push({ id: `unplaced:${id}`, severity: "error", title: `${id} has doors but no place on the ship`, cells: [], room: id });
  for (const o of report.overlaps) {
    out.push({
      id: `overlap:${o.kind}:${o.rooms.join(":")}`,
      severity: "error",
      title: `${o.rooms[0]} floor on ${o.rooms[1]}'s`,
      detail: `${o.cells.length} cell${o.cells.length === 1 ? "" : "s"}`,
      cells: o.cells,
      room: o.rooms[0],
    });
  }

  // Doors: no floor under them, no room to go to, or no door back.
  const floor = new Set<string>();
  for (const r of ship.rooms.filter(isPlaced)) for (const t of r.tiles) if (t.kind === "ground") floor.add(shipCell(r, t).join());
  for (const r of ship.rooms.filter(isPlaced)) {
    for (const [index, t] of r.tiles.entries()) {
      if (t.kind !== "door") continue;
      const tile = { room: r.id, index };
      const cells = doorCells(ship.slices, t).map((c) => shipCell(r, c));
      const target = t.door?.target ? byId.get(t.door.target) : undefined;
      if (!target) {
        out.push({ id: `door-nowhere:${r.id}#${index}`, severity: "error", title: `${r.id} door goes nowhere`, detail: t.door?.target ? `no room ${t.door.target}` : "no room set", cells, room: r.id, tile });
        continue;
      }
      const bare = cells.filter((c) => !floor.has(c.join()));
      const pinned = KNOWN_MISALIGNED.some((k) => k.startsWith(`${r.id} -> ${target.id} `) || k.startsWith(`${target.id} -> ${r.id} `));
      if (bare.length) {
        out.push({
          id: `door-floor:${r.id}#${index}`,
          severity: "error",
          title: `${r.id} door to ${target.id} has no floor under it`,
          ...(pinned && { known: "its two sides don't meet (pinned)" }),
          cells: bare,
          room: r.id,
          tile,
        });
      }
      if (!target.tiles.some((u) => u.door?.target === r.id)) {
        out.push({ id: `door-back:${r.id}#${index}`, severity: "error", title: `${r.id} door to ${target.id} has no door back`, cells, room: r.id, tile });
      }
    }
  }

  // Equipment bindings no tile draws (left out of the game), unless it is only ever built later.
  for (const r of ship.rooms) {
    const drawn = new Set(placedEquipment(r).map((e) => e.id));
    for (const b of r.equipment) {
      if (drawn.has(`${r.id}:${b.key ?? b.id}`) || EQUIPMENT_TYPES[b.id]?.builtOnly) continue;
      out.push({
        id: `equipment:${r.id}:${b.key ?? b.id}`,
        severity: "warning",
        title: `${r.id} ${b.key ?? b.id} has no ${b.tile} tile`,
        detail: "the game leaves it out",
        // `at` is only the origin tiles are offset from, and can lie in another room: mark the room's own tiles.
        cells: r.at ? r.tiles.map((t): [number, number] => [t.x + r.at!.x, t.y + r.at!.y]) : [],
        room: r.id,
      });
    }
    // A terminal's chairs (#192) are cells: moving or deleting the chair tile leaves the terminal pointing at nothing.
    for (const b of r.equipment) {
      for (const c of b.chairs ?? []) {
        if (r.tiles.some((t) => t.kind === "entity" && t.x === c.x && t.y === c.y && ship.slices[t.slice]?.flags.includes("chair"))) continue;
        out.push({
          id: `chair:${r.id}:${b.key ?? b.id}:${c.x},${c.y}`,
          severity: "error",
          title: `${r.id} ${b.key ?? b.id} has no chair at ${c.x},${c.y}`,
          detail: "its \"chairs\" in ship-map.json name a cell with no chair tile",
          cells: r.at ? [[c.x + r.at.x, c.y + r.at.y]] : [],
          room: r.id,
        });
      }
    }
  }

  for (const d of report.doors) {
    const [a, b] = d.rooms as [string, string];
    const name = `${a} -> ${b} ${d.off.x},${d.off.y}`;
    const tile = doorTile(a, b);
    const ra = byId.get(a) as Placed;
    const back = byId.get(b)!.tiles.find((u) => u.door?.target === a)!;
    const rb = byId.get(b) as Placed;
    // The doorway cells of both doors, not just their anchors: a front-edge door has no drawn art, but its cells are where you cross.
    const doorway = (r: Placed, t: TilePlacement) => doorCells(ship.slices, t).map((c) => shipCell(r, c));
    out.push({
      id: `misaligned:${a}:${b}`,
      severity: "warning",
      title: `Door ${a} / ${b} doesn't meet`,
      detail: `${b}'s side is off by ${d.off.x},${d.off.y}`,
      ...(KNOWN_MISALIGNED.includes(name) && { known: "pinned in a test" }),
      cells: [...doorway(ra, ra.tiles[tile!.index]!), ...doorway(rb, back)],
      room: a,
      ...(tile && { tile }),
    });
  }

  // Wall ends, one problem per end, from however many views it shows in. Off for now (WALL_CHECKS).
  const ends = new Map<string, WallEnd[]>();
  for (const w of WALL_CHECKS ? wallEnds(ship) : []) {
    const k = `${w.room} ${w.end[0]},${w.end[1]}`;
    ends.set(k, [...(ends.get(k) ?? []), w]);
  }
  for (const [k, ws] of ends) {
    const w = ws[0]!;
    const all = ws.some((v) => v.depth === "all");
    const views = all ? `from ${new Set(ws.map((v) => v.from)).size} rooms` : `only from ${ws.map((v) => v.from).join(", ")} at fog depth 1`;
    out.push({
      id: `wall-end:${k}`,
      severity: "warning",
      title: `${w.room} wall stops ${w.short} short of ${w.others.join("/")}'s`,
      detail: `at ${w.end[0]},${w.end[1]}, ${views}`,
      ...(KNOWN_WALL_ENDS[k] && { known: KNOWN_WALL_ENDS[k] }),
      cells: [w.end],
      room: w.room,
      ...(!all && { view: { from: w.from, depth: 1 } }),
    });
  }

  for (const g of report.gaps) {
    out.push({ id: `gap:${g.rooms.join(":")}`, severity: "info", title: `Gap between ${g.rooms[0]} and ${g.rooms[1]}`, detail: `${g.cells.length} cell${g.cells.length === 1 ? "" : "s"}`, cells: g.cells, room: g.rooms[0] });
  }
  return out.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
}
