// Pure placement math for the isometric room view: no DOM, no React, so it
// can be unit tested and run headless. Reproduces the original Flash client
// (clients/iso/src: V2DIso.grid2px, Data.setup, Grid.sort/sortFunc).

import type { RoomLayout, ShipLayout, SliceInfo, TileKind } from "@mush2/shared";

/** Half the width of one cell's diamond, in pixels (V2DIso.R). */
const R = 16;

/** Grid cell -> pixel position of the cell's anchor (V2DIso.grid2px). */
export const gridToPx = (x: number, y: number) => ({ x: (x - y) * R, y: (x + y) * (R / 2) });

/**
 * Render passes, back to front (Grid.sort). Tiles (floor, walls, doors, and
 * the props attached to them) are one pass sorted by depth; entities come
 * after all tiles, so walls never covered furniture or people. That is still
 * the starting order, but `compare` lets a wall cover what stands behind it.
 */
const PASS = { prewall: 0, tile: 1, postwall: 2, entity: 3, post: 4 } as const;

/** Within a pass at equal depth, higher priority draws behind (IsoConst). */
const PRIO = { tile: 10, decal: 5, entity: 0 } as const;

export interface PlacedSprite {
  key: string;
  /** Id of the room this sprite belongs to. */
  room: string;
  kind: TileKind | "actor";
  cell: { x: number; y: number };
  /** Top-left corner on screen, in unscaled pixels, relative to the room origin. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Paint order; higher draws in front. */
  order: number;
  slice: string;
  sheet: string;
  /** Source rectangle of the frame in the sheet image. */
  sx: number;
  sy: number;
  flipX: boolean;
  flipY: boolean;
  door?: { target: string };
  /** People only: a wall, or something in another room, is drawn over them, so they get a see-through outline. */
  occluded?: boolean;
}

export interface Actor {
  id: string;
  cell: { x: number; y: number };
  /** Sprite frame size; the original drew characters at offset (2, -12). */
  width: number;
  height: number;
}

/** Draw offset the original client used for 32x48 crew sprites (Data.hx regChar). */
export const ACTOR_OFFSET = { x: 2, y: -12 } as const;

interface Sortable {
  pass: number;
  depth: number;
  prio: number;
  /** Sub-order within one tile: floor, then wall/door, then prop (creation order in Tile). */
  stage: number;
  screenX: number;
  /** Index of the sprite's room in the scene; 0 is the room you're in. */
  scene: number;
  /**
   * Cells covered, inclusive: the footprint, extending toward -x/-y from the
   * anchor, cut to the room's floor (some reach into the wall rows; anything
   * mounted on a wall sits on the floor's edge).
   */
  box: { x0: number; x1: number; y0: number; y1: number };
  /**
   * How it stands: `flat` on the floor or a wall (floor tiles, `decal`s but
   * not chairs, which only sort like decals, and front-edge doors), a `wall`
   * or door, or `solid` (furniture, props, people).
   */
  shape: "flat" | "wall" | "solid";
}

/**
 * Art the original drew that we leave out. The doormats on either side of a
 * door were clutter once the rooms behind the doors were drawn too.
 */
const HIDDEN_SLICES = new Set(["DOOR_L_FLOOR", "DOOR_R_FLOOR"]);

/**
 * Doors on a room's two front edges. The original drew no front walls, so
 * these are floor-level thresholds; once the room behind the door is drawn,
 * its own door on the same cell takes over and these are left out too.
 */
const FRONT_DOORS = new Set(["DOOR_BL", "DOOR_BR"]);

/** One room drawn into a scene, shifted by (dx, dy) cells. */
export interface SceneRoom {
  room: RoomLayout;
  dx: number;
  dy: number;
  actors: readonly Actor[];
}

export function frameRect(slice: SliceInfo, frame: number) {
  return {
    sx: slice.x + (frame % slice.framesX) * slice.width,
    sy: slice.y + Math.floor(frame / slice.framesX) * slice.height,
  };
}

/**
 * Every sprite in a room, plus the given actors, with screen positions and a
 * paint order. Sprites are centered on their anchor point plus the slice's
 * offset. (mt.pix, which did this in the original, is not in the archive;
 * centering is inferred from how floor tiles line up with their cells.)
 */
export function placeRoom(layout: ShipLayout, room: RoomLayout, actors: readonly Actor[] = []): PlacedSprite[] {
  return placeScene(layout, [{ room, dx: 0, dy: 0, actors }]);
}

/**
 * Several rooms drawn together, in one paint order, on one grid: each room is
 * shifted by its (dx, dy) cells. The first room is the one you're in; its
 * sprite keys are as in `placeRoom`, the others' are prefixed "<room id>/"
 * (actor keys, "a:<id>", are unique already).
 */
export function placeScene(layout: ShipLayout, rooms: readonly SceneRoom[]): PlacedSprite[] {
  const placed: (PlacedSprite & Sortable)[] = [];
  const drawn = new Set(rooms.map((r) => r.room.id));
  rooms.forEach((r, scene) => placed.push(...sortables(layout, r, scene, drawn)));
  const ordered = paintOrder(placed);
  markOccluded(ordered);
  return ordered.map(({ pass, depth, prio, stage, screenX, scene, box, shape, ...s }, order) => ({ ...s, order }));
}

function sortables(
  layout: ShipLayout,
  { room, dx, dy, actors }: SceneRoom,
  scene: number,
  drawn: ReadonlySet<string>,
): (PlacedSprite & Sortable)[] {
  const placed: (PlacedSprite & Sortable)[] = [];
  const prefix = scene === 0 ? "" : `${room.id}/`;
  const floor = floorBounds(room, dx, dy);

  room.tiles.forEach((t, i) => {
    if (HIDDEN_SLICES.has(t.slice)) return;
    const frontDoor = FRONT_DOORS.has(t.slice);
    if (frontDoor && t.door && drawn.has(t.door.target)) return;
    const slice = layout.slices[t.slice]!;
    const x = t.x + dx, y = t.y + dy;
    const anchor = gridToPx(x, y);
    const isEntity = t.kind === "entity";
    const decal = slice.flags.includes("decal") || slice.flags.includes("chair");
    const [w, h] = slice.footprint ?? [1, 1];
    const flat = t.kind === "ground" || frontDoor || (slice.flags.includes("decal") && !slice.flags.includes("chair"));
    placed.push({
      key: `${prefix}t${i}`,
      room: room.id,
      kind: t.kind,
      cell: { x, y },
      left: anchor.x + slice.offset[0] - slice.width / 2,
      top: anchor.y + slice.offset[1] - slice.height / 2,
      width: slice.width,
      height: slice.height,
      slice: t.slice,
      sheet: slice.sheet,
      ...frameRect(slice, t.frame),
      flipX: slice.flipX,
      flipY: slice.flipY,
      ...(t.door && { door: t.door }),
      order: 0,
      pass: isEntity ? entityPass(slice.engine) : PASS.tile,
      depth: x + y,
      prio: isEntity ? (decal ? PRIO.decal : PRIO.entity) : PRIO.tile,
      stage: t.kind === "ground" ? 0 : t.kind === "prop" ? 2 : 1,
      screenX: anchor.x,
      scene,
      box: t.kind === "ground" || t.kind === "wall" || t.kind === "door" ? { x0: x - w + 1, x1: x, y0: y - h + 1, y1: y } : clip(x - w + 1, x, y - h + 1, y, floor),
      shape: flat ? "flat" : t.kind === "wall" || t.kind === "door" ? "wall" : "solid",
    });
  });

  for (const a of actors) {
    const x = a.cell.x + dx, y = a.cell.y + dy;
    const anchor = gridToPx(x, y);
    const lift = groundOffsetAt(layout, room, a.cell.x, a.cell.y);
    placed.push({
      key: `a:${a.id}`,
      room: room.id,
      kind: "actor",
      cell: { x, y },
      left: anchor.x + ACTOR_OFFSET.x - a.width / 2,
      top: anchor.y + ACTOR_OFFSET.y - a.height / 2 - lift,
      width: a.width,
      height: a.height,
      slice: "",
      sheet: "",
      sx: 0,
      sy: 0,
      flipX: false,
      flipY: false,
      order: 0,
      pass: PASS.entity,
      depth: x + y,
      prio: PRIO.entity,
      stage: 0,
      screenX: anchor.x,
      scene,
      box: { x0: x, x1: x, y0: y, y1: y },
      shape: "solid",
    });
  }
  return placed;
}

type Box = Sortable["box"];

/** The cells a room's floor spans, shifted by (dx, dy). */
function floorBounds(room: RoomLayout, dx: number, dy: number): Box {
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const t of room.tiles) {
    if (t.kind !== "ground") continue;
    box.x0 = Math.min(box.x0, t.x + dx);
    box.x1 = Math.max(box.x1, t.x + dx);
    box.y0 = Math.min(box.y0, t.y + dy);
    box.y1 = Math.max(box.y1, t.y + dy);
  }
  return box;
}

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? v : Math.min(hi, Math.max(lo, v)));

/** A footprint cut to the floor; one wholly off it shrinks onto the floor's nearest edge. */
function clip(x0: number, x1: number, y0: number, y1: number, floor: Box): Box {
  return {
    x0: clamp(x0, floor.x0, floor.x1),
    x1: clamp(x1, floor.x0, floor.x1),
    y0: clamp(y0, floor.y0, floor.y1),
    y1: clamp(y1, floor.y0, floor.y1),
  };
}

/**
 * The original's order (Grid.sortFunc): by pass, then anchor depth (x + y).
 * At a tie, the room you're in draws over the others.
 */
const baseOrder = (a: Sortable, b: Sortable) =>
  a.pass - b.pass || a.depth - b.depth || b.prio - a.prio || a.screenX - b.screenX || a.stage - b.stage || b.scene - a.scene;

/**
 * Which footprint is further from the camera: the one wholly at lower x, or
 * wholly at lower y. 0 when neither is (they overlap, or sit diagonally
 * apart, where neither can hide the other).
 */
function behind(a: Sortable, b: Sortable): number {
  const aFirst = a.box.x1 < b.box.x0 || a.box.y1 < b.box.y0;
  const bFirst = b.box.x1 < a.box.x0 || b.box.y1 < a.box.y0;
  return aFirst === bFirst ? 0 : aFirst ? -1 : 1;
}

/** One footprint wholly at lower x and the other wholly at lower y: side by side on screen. */
const diagonal = (a: Sortable, b: Sortable) =>
  (a.box.x1 < b.box.x0 && b.box.y1 < a.box.y0) || (b.box.x1 < a.box.x0 && a.box.y1 < b.box.y0);

const boxesOverlap = (a: Sortable, b: Sortable) =>
  a.box.x0 <= b.box.x1 && b.box.x0 <= a.box.x1 && a.box.y0 <= b.box.y1 && b.box.y0 <= a.box.y1;

/**
 * Which of two sprites whose pictures overlap draws first (negative: a; 0:
 * either, no constraint).
 *
 * The original sorted by anchor depth alone, which works for one-cell things
 * but not for wide furniture (a chair or a person at the front of a 4-cell
 * console has the same x + y as its anchor), and not across rooms: it drew
 * each room on its own, with every wall before every entity, and no walls on
 * a room's front edges. So:
 * - Within one room, floors and walls keep the original order among
 *   themselves, and floors go under everything standing on them.
 * - Otherwise, the footprint further back (wholly at lower x, or lower y)
 *   draws first: a wall or door covers whatever stands behind it, in any
 *   room, people included (they get an outline instead, see `occluded`), and
 *   across rooms a floor covers the foot of a wall behind it.
 * - Footprints diagonally apart can't hide each other, so they get no
 *   constraint (forcing one is what tangles the order into loops).
 * - Where footprints overlap: things mounted on a wall go over it, floors and
 *   flat decals go under what stands on them.
 */
function compare(a: PlacedSprite & Sortable, b: PlacedSprite & Sortable): number {
  if (a.pass !== PASS.tile && a.pass !== PASS.entity) return baseOrder(a, b);
  if (b.pass !== PASS.tile && b.pass !== PASS.entity) return baseOrder(a, b);
  const standing = (a.shape === "wall" && b.shape === "solid") || (b.shape === "wall" && a.shape === "solid");
  if (a.scene === b.scene && !standing) {
    if (a.pass !== PASS.entity || b.pass !== PASS.entity) return baseOrder(a, b);
    const flatA = a.shape === "flat", flatB = b.shape === "flat";
    if (flatA !== flatB && (a.kind === "actor" || b.kind === "actor" || boxesOverlap(a, b))) return flatA ? -1 : 1;
    return behind(a, b) || baseOrder(a, b);
  }
  if (diagonal(a, b)) return 0;
  const g = behind(a, b);
  if (g) return g;
  if (standing) return a.shape === "wall" ? -1 : 1;
  if ((a.shape === "flat") !== (b.shape === "flat")) return a.shape === "flat" ? -1 : 1;
  return baseOrder(a, b);
}

/**
 * Paint order: a topological sort of "draws before" between every pair of
 * sprites whose boxes overlap on screen (`compare`), taking the earliest in
 * the original order whenever there's a choice. A cycle, which the rules
 * above can make in odd corners, is broken at its earliest sprite (found by
 * walking back from a stuck sprite, so sprites merely waiting on a cycle keep
 * their own constraints).
 */
function paintOrder<S extends PlacedSprite & Sortable>(sprites: S[]): S[] {
  const base = [...sprites].sort(baseOrder);
  const n = base.length;
  const after: number[][] = base.map(() => []);
  const before: number[][] = base.map(() => []);
  const waiting = new Array<number>(n).fill(0);
  // Sweep along x so only sprites that can overlap are compared.
  const byLeft = base.map((_, i) => i).sort((i, j) => base[i]!.left - base[j]!.left);
  for (let p = 0; p < n; p++) {
    const i = byLeft[p]!, a = base[i]!;
    for (let q = p + 1; q < n; q++) {
      const j = byLeft[q]!, b = base[j]!;
      if (b.left >= a.left + a.width) break;
      if (b.top >= a.top + a.height || a.top >= b.top + b.height) continue;
      const c = compare(a, b);
      if (c === 0) continue;
      const [first, second] = c < 0 ? [i, j] : [j, i];
      after[first]!.push(second);
      before[second]!.push(first);
      waiting[second]!++;
    }
  }

  // Ready sprites in a min-heap of their index in the original order.
  const heap: number[] = [];
  const push = (v: number) => {
    let k = heap.push(v) - 1;
    while (k > 0 && heap[(k - 1) >> 1]! > v) {
      heap[k] = heap[(k - 1) >> 1]!;
      k = (k - 1) >> 1;
    }
    heap[k] = v;
  };
  const pop = () => {
    const top = heap[0]!, last = heap.pop()!;
    if (heap.length) {
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && heap[c + 1]! < heap[c]!) c++;
        if (heap[c]! >= last) break;
        heap[k] = heap[c]!;
        k = c;
      }
      heap[k] = last;
    }
    return top;
  };

  for (let i = 0; i < n; i++) if (waiting[i] === 0) push(i);
  const done = new Array<boolean>(n).fill(false);
  const out: S[] = [];
  let next = 0; // Lowest index that might not be drawn yet, for breaking cycles.
  while (out.length < n) {
    if (heap.length === 0) {
      while (done[next]) next++;
      const cut = cycleStart(next, before, done);
      waiting[cut] = 0;
      push(cut);
    }
    const i = pop();
    if (done[i]) continue;
    done[i] = true;
    out.push(base[i]!);
    for (const j of after[i]!) if (--waiting[j]! === 0 && !done[j]) push(j);
  }
  return out;
}

/**
 * Flags people with a wall or door drawn over them, or anything standing in
 * another room (which is behind a wall). Furniture in their own room doesn't
 * count: standing behind a table isn't hiding. Rectangles only, so it errs
 * towards outlining, except that a sliver under OCCLUSION_MIN_COVER doesn't count; the inset keeps a wall's transparent corner just
 * brushing the empty edge of a person's frame from counting.
 */
function markOccluded(ordered: (PlacedSprite & Sortable)[]) {
  ordered.forEach((a, i) => {
    if (a.kind !== "actor") return;
    const l = a.left + OCCLUSION_INSET.x, r = a.left + a.width - OCCLUSION_INSET.x;
    const t = a.top + OCCLUSION_INSET.top, b = a.top + a.height - OCCLUSION_INSET.bottom;
    const rects: [number, number, number, number][] = [];
    for (const s of ordered.slice(i + 1)) {
      if (!(s.shape === "wall" || (s.shape === "solid" && s.kind !== "actor" && s.room !== a.room)) || s.pass === PASS.post) continue;
      const x0 = Math.max(l, s.left), x1 = Math.min(r, s.left + s.width);
      const y0 = Math.max(t, s.top), y1 = Math.min(b, s.top + s.height);
      if (x1 > x0 && y1 > y0) rects.push([x0, y0, x1, y1]);
    }
    const covered = unionArea(rects);
    a.occluded = covered >= (r - l) * (b - t) * OCCLUSION_MIN_COVER;
  });
}

/** Area of the union of axis-aligned rectangles (x0, y0, x1, y1), so overlapping walls aren't counted twice. */
function unionArea(rects: [number, number, number, number][]): number {
  if (rects.length === 0) return 0;
  const xs = [...new Set(rects.flatMap((q) => [q[0], q[2]]))].sort((p, q) => p - q);
  let area = 0;
  for (let k = 0; k + 1 < xs.length; k++) {
    const xa = xs[k]!, xb = xs[k + 1]!;
    const spans = rects.filter((q) => q[0] <= xa && q[2] >= xb).map((q) => [q[1], q[3]] as const).sort((p, q) => p[0] - q[0]);
    let y = -Infinity, len = 0;
    for (const [y0, y1] of spans) {
      if (y1 > y) { len += y1 - Math.max(y0, y); y = y1; }
    }
    area += len * (xb - xa);
  }
  return area;
}

/** Share of a person's (inset) box that must be covered by walls (their union), before they get the outline. */
const OCCLUSION_MIN_COVER = 0.75;

/** Empty margin around a person in their 32x48 frame. */
const OCCLUSION_INSET = { x: 8, top: 8, bottom: 4 } as const;

/**
 * The earliest sprite on a cycle upstream of `from`, every sprite not yet
 * `done` being stuck behind another that isn't: walk back through undrawn
 * predecessors until one repeats.
 */
function cycleStart(from: number, before: readonly number[][], done: readonly boolean[]): number {
  const seen = new Map<number, number>();
  const path: number[] = [];
  let v = from;
  while (!seen.has(v)) {
    seen.set(v, path.length);
    path.push(v);
    v = before[v]!.find((u) => !done[u])!;
  }
  return Math.min(...path.slice(seen.get(v)));
}

function entityPass(engine: string | undefined): number {
  switch (engine) {
    case "prewall":
      return PASS.prewall;
    case "tile":
    case "wall":
      return PASS.tile;
    case "postwall":
      return PASS.postwall;
    case "post":
    case "postfx":
      return PASS.post;
    default:
      return PASS.entity;
  }
}

/** Raised floor (`ground_higher` frames) lifts whoever stands on it. */
function groundOffsetAt(layout: ShipLayout, room: RoomLayout, x: number, y: number): number {
  const ground = room.tiles.find((t) => t.kind === "ground" && t.x === x && t.y === y);
  return ground ? (layout.slices[ground.slice]!.frames[ground.frame]?.groundOffsetY ?? 0) : 0;
}

/**
 * Cells someone can stand on (Grid.isWalkable): floor not covered by a door or
 * by any entity footprint except decals and chairs. Footprints extend from the
 * anchor toward -x/-y (Ship.buildRoomBmp mkDep/mkDoor).
 */
export function walkableCells(layout: ShipLayout, room: RoomLayout): { x: number; y: number }[] {
  const blocked = new Set<string>();
  for (const t of room.tiles) {
    const slice = layout.slices[t.slice]!;
    if (t.kind !== "entity" && t.kind !== "door") continue;
    if (slice.flags.some((f) => f === "decal" || f === "chair")) continue;
    const [w, h] = slice.footprint ?? [1, 1];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) blocked.add(`${t.x - i},${t.y - j}`);
  }
  return room.tiles
    .filter((t) => t.kind === "ground" && !blocked.has(`${t.x},${t.y}`))
    .map((t) => ({ x: t.x, y: t.y }));
}

/**
 * Deterministic standing spots, one per actor in the order given: prefer open
 * floor (cells far from anything blocking), then the middle of that floor.
 * Display only; where people stand isn't game state.
 */
export function spreadActors(cells: readonly { x: number; y: number }[], count: number): { x: number; y: number }[] {
  if (cells.length === 0) return [];
  const walkable = new Set(cells.map((c) => `${c.x},${c.y}`));
  const clearance = (c: { x: number; y: number }) => {
    for (let r = 1; r <= MAX_CLEARANCE; r++) {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) if (!walkable.has(`${c.x + dx},${c.y + dy}`)) return r - 1;
    }
    return MAX_CLEARANCE;
  };
  const cx = cells.reduce((s, c) => s + c.x, 0) / cells.length;
  const cy = cells.reduce((s, c) => s + c.y, 0) / cells.length;
  const ranked = cells
    .map((c) => ({ x: c.x, y: c.y, clear: clearance(c), dist: Math.hypot(c.x - cx, c.y - cy) }))
    .sort((a, b) => b.clear - a.clear || a.dist - b.dist || a.x - b.x || a.y - b.y);

  // Greedy: best-ranked cell not next to anyone already placed. If the room
  // is too crowded for that, fall back to any free cell, then to sharing.
  const picked: { x: number; y: number }[] = [];
  const near = (c: { x: number; y: number }, gap: number) =>
    picked.some((p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) <= gap);
  for (let i = 0; i < count; i++) {
    const spot = ranked.find((c) => !near(c, 1)) ?? ranked.find((c) => !near(c, 0)) ?? ranked[i % ranked.length]!;
    picked.push({ x: spot.x, y: spot.y });
  }
  return picked;
}

/**
 * The walkable cell whose floor diamond contains the room-pixel point (x, y),
 * or undefined if the point is off the floor. Floor diamonds are centred a
 * little below the cell anchor (the ground slices' y offset).
 */
export function cellAtPoint(
  cells: readonly { x: number; y: number }[],
  x: number,
  y: number,
): { x: number; y: number } | undefined {
  return cells.find((c) => {
    const a = gridToPx(c.x, c.y);
    return Math.abs(x - a.x) / R + Math.abs(y - (a.y + FLOOR_CENTER_Y)) / (R / 2) <= 1;
  });
}

const FLOOR_CENTER_Y = 6;

/**
 * Where to stand to use the thing drawn by `room.tiles[tile]`: the middle of
 * its wider edge (the x-run if at least as wide as deep, else the y-run),
 * camera-facing side first. Falls back outward along that edge, then the far
 * side of the same edge, then the narrow edges, then the nearest walkable cell. Footprints extend from the anchor toward
 * -x/-y (see walkableCells). Display only; where people stand isn't game state.
 */
export function standSpot(
  layout: ShipLayout,
  room: RoomLayout,
  tile: number,
  cells: readonly { x: number; y: number }[],
): { x: number; y: number } | undefined {
  const t = room.tiles[tile];
  if (!t || cells.length === 0) return undefined;
  const [w, h] = layout.slices[t.slice]!.footprint ?? [1, 1];
  const x0 = t.x - w + 1, y0 = t.y - h + 1;
  /** Cells of one edge, middle first (for an even edge, the lower-index middle cell first). */
  const edge = (len: number, at: (i: number) => { x: number; y: number }) =>
    Array.from({ length: len }, (_, i) => i)
      .sort((a, b) => Math.abs(a - (len - 1) / 2) - Math.abs(b - (len - 1) / 2) || a - b)
      .map(at);
  const frontY = edge(w, (i) => ({ x: x0 + i, y: t.y + 1 }));
  const frontX = edge(h, (j) => ({ x: t.x + 1, y: y0 + j }));
  const backY = edge(w, (i) => ({ x: x0 + i, y: y0 - 1 }));
  const backX = edge(h, (j) => ({ x: x0 - 1, y: y0 + j }));
  const order = w >= h ? [...frontY, ...backY, ...frontX, ...backX] : [...frontX, ...backX, ...frontY, ...backY];
  const walkable = new Set(cells.map((c) => `${c.x},${c.y}`));
  const found = order.find((c) => walkable.has(`${c.x},${c.y}`));
  if (found) return found;
  const cx = (x0 + t.x) / 2, cy = (y0 + t.y) / 2;
  return [...cells].sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
}

/**
 * Rooms behind `room`'s doors, each with the grid shift that puts its door
 * back to `room` on the same cell as `room`'s door to it, so the two share
 * that wall. Rooms are drawn separately in the original, so this is the only
 * way to place them side by side; it's local (neighbours of different doors
 * can overlap a little). Rooms without a matching door, or without art, are
 * left out.
 *
 * With a larger `depth` the rooms behind those rooms' doors follow (`ring` 2, 3, ...),
 * placed the same way from their neighbour; "all" keeps going until the whole ship is
 * reached. Rooms are only placed locally, so beyond the first ring they can overlap each
 * other (paint order sorts it out); one whose floor would land on `room`'s own is left out.
 */
export function neighborRooms(
  layout: ShipLayout,
  room: RoomLayout,
  depth: 1 | 2 | "all" = 1,
): { room: RoomLayout; dx: number; dy: number; ring: number }[] {
  const result: { room: RoomLayout; dx: number; dy: number; ring: number }[] = [];
  const doorsOf = (from: RoomLayout, fx: number, fy: number, ring: number) => {
    for (const t of from.tiles) {
      const target = t.door?.target;
      if (!target || target === room.id || result.some((n) => n.room.id === target)) continue;
      const other = layout.rooms.find((r) => r.id === target);
      const back = other?.tiles.find((b) => b.door?.target === from.id);
      if (!other || !back) continue;
      const dx = fx + t.x - back.x, dy = fy + t.y - back.y;
      if (ring > 1) {
        const f = floorBounds(other, dx, dy);
        const hits = (g: Box) => f.x0 <= g.x1 && g.x0 <= f.x1 && f.y0 <= g.y1 && g.y0 <= f.y1;
        if (hits(floorBounds(room, 0, 0))) continue;
      }
      result.push({ room: other, dx, dy, ring });
    }
  };
  doorsOf(room, 0, 0, 1);
  const last = depth === "all" ? Infinity : depth;
  for (let ring = 2, frontier = result.slice(); ring <= last && frontier.length; ring++) {
    const before = result.length;
    for (const n of frontier) doorsOf(n.room, n.dx, n.dy, ring);
    frontier = result.slice(before);
  }
  return result;
}

/**
 * Camera offset along one axis: centre content smaller than the panel,
 * otherwise keep `focus` centred but never show past the content's edges.
 */
export function cameraOffset(panel: number, content: number, focus: number): number {
  if (content <= panel) return (panel - content) / 2;
  return Math.min(0, Math.max(panel - content, panel / 2 - focus));
}

/** Clearance beyond this many cells doesn't make a spot any better. */
const MAX_CLEARANCE = 3;

/** Bounding box of placed sprites, for sizing the view. */
export function bounds(sprites: readonly PlacedSprite[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of sprites) {
    minX = Math.min(minX, s.left);
    minY = Math.min(minY, s.top);
    maxX = Math.max(maxX, s.left + s.width);
    maxY = Math.max(maxY, s.top + s.height);
  }
  return sprites.length ? { minX, minY, width: maxX - minX, height: maxY - minY } : { minX: 0, minY: 0, width: 0, height: 0 };
}

/**
 * The topmost sprite with an opaque pixel at (x, y), in the same room-pixel
 * space as `left`/`top`. `sprites` must be in paint order (as `placeRoom`
 * returns them), so anything drawn in front, interactive or not, wins.
 * `opaque` gets the pixel in the sprite's source frame, with flips undone.
 */
export function hitTest<S extends Pick<PlacedSprite, "left" | "top" | "width" | "height" | "flipX" | "flipY">>(
  sprites: readonly S[],
  x: number,
  y: number,
  opaque: (sprite: S, px: number, py: number) => boolean,
): S | undefined {
  for (let i = sprites.length - 1; i >= 0; i--) {
    const s = sprites[i]!;
    const lx = Math.floor(x - s.left);
    const ly = Math.floor(y - s.top);
    if (lx < 0 || ly < 0 || lx >= s.width || ly >= s.height) continue;
    if (opaque(s, s.flipX ? s.width - 1 - lx : lx, s.flipY ? s.height - 1 - ly : ly)) return s;
  }
  return undefined;
}
