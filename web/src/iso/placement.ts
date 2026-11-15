// Pure placement math for the isometric room view: no DOM, no React, so it
// can be unit tested and run headless. Reproduces the original Flash client
// (clients/iso/src: V2DIso.grid2px, Data.setup, Grid.sort/sortFunc).

import type { RoomLayout, ShipLayout, SliceInfo, TileKind, TilePlacement } from "@mush2/shared";
// By module, not the package's index: the index imports ship-rooms.json, which plain Node (`npm run
// ship-render`) can't load without an import attribute.
import { placedEquipment } from "@mush2/shared/src/shipLayout.ts";

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
  /** Lies on the furniture it overlaps (a bed), so it is drawn over it. */
  onTop?: boolean;
  /** Extra screen offset in pixels, past the cell's (a bed's `ofsx`/`ofsy`, `lyingPose`). */
  shift?: { x: number; y: number };
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
  /** An actor lying on whatever overlaps it (see `Actor.onTop`). */
  onTop?: boolean;
  /**
   * A wall that stops at a T: the room whose other-axis wall on its cell carries on. It draws under
   * everything of that room but its floor: the wall, its doors and what is mounted on them (`markTees`).
   */
  under?: string;
}

/**
 * Which way each wall slice runs: along x (the main axis, on its cell's +y edge), along y (the cross
 * axis, on its +x edge), or both (`corner_02`, the original's front corner). Posts and front-edge doors
 * stand on no edge; doors run by their footprint (see `wallRuns`).
 */
export const WALL_RUNS: Readonly<Record<string, "x" | "y" | "xy">> = {
  BIG_WALL_L: "y",
  WALL_L_DECK: "y",
  BIG_WALL_R: "x",
  WALL_R_DECK: "x",
  corner_02: "xy",
};

/** The edges a wall or door tile stands on, as the cells whose +y edge (x) or +x edge (y) it is. */
export function wallRuns(layout: ShipLayout, t: { kind: TileKind | "actor"; slice: string; x: number; y: number }): { axis: "x" | "y"; x: number; y: number }[] {
  if (t.kind === "wall") {
    const run = WALL_RUNS[t.slice] ?? "";
    return [...(run.includes("x") ? [{ axis: "x" as const, x: t.x, y: t.y }] : []), ...(run.includes("y") ? [{ axis: "y" as const, x: t.x, y: t.y }] : [])];
  }
  if (t.kind !== "door" || FRONT_DOORS.has(t.slice)) return [];
  const [w] = layout.slices[t.slice]?.footprint ?? [1, 1];
  return w > 1
    ? [{ axis: "x", x: t.x, y: t.y }, { axis: "x", x: t.x - 1, y: t.y }]
    : [{ axis: "y", x: t.x, y: t.y }, { axis: "y", x: t.x, y: t.y - 1 }];
}

/**
 * T junctions (owner, 2026-11-14): where a main-axis wall and a cross-axis wall share a cell, they meet
 * at its +x+y corner. If one of them carries on past that corner and the other stops there, the one
 * that stops draws under the other, so its end cap hides behind the wall it runs into and the two top
 * ridges join. It goes under whatever is mounted on that wall too (a sign reaching across), or the
 * order would loop. (An L, where both stop, is `corner_02`; where both carry on, neither is marked.)
 */
function markTees(layout: ShipLayout, statics: readonly (PlacedSprite & Sortable)[]) {
  const runs = new Map<string, string>();
  const walls = statics.filter((s) => s.kind === "wall" || s.kind === "door");
  for (const s of walls) for (const r of wallRuns(layout, { ...s, ...s.cell })) runs.set(`${r.axis}${r.x},${r.y}`, s.room);
  for (const s of statics) {
    if (s.kind !== "wall") continue;
    const run = WALL_RUNS[s.slice];
    if (run !== "x" && run !== "y") continue;
    const { x, y } = s.cell;
    const other = run === "x" ? "y" : "x";
    const over = runs.get(`${other}${x},${y}`);
    if (!over) continue;
    // Past the +x+y corner: the next x edge is on cell (x + 1, y), the next y edge on (x, y + 1).
    const carriesOn = (axis: "x" | "y") => runs.has(axis === "x" ? `x${x + 1},${y}` : `y${x},${y + 1}`);
    if (!carriesOn(run) && carriesOn(other)) s.under = over;
  }
}

/**
 * Doors on a room's two front edges. The original drew no front walls, so
 * these are floor-level thresholds; once the room behind the door is drawn,
 * its own door on the same cell takes over and these are left out.
 */
const FRONT_DOORS = new Set(["DOOR_BL", "DOOR_BR"]);

/**
 * Chairs drawn in front of the console they sit at, though their cell is further back than its
 * footprint (owner, 2026-10-18): "room:x,y" of the chair's own cell. They sort as if on the
 * console's row.
 */
const CHAIRS_IN_FRONT = new Set(["COMMAND_CENTER:8,18"]);

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
  return placeActors(prepareScene(layout, rooms), rooms.map((r) => r.actors));
}

/** A scene's rooms without their people. */
export type SceneRooms = readonly Omit<SceneRoom, "actors">[];

/**
 * The part of a scene that doesn't move: its tiles, sorted, and which of them draw before which.
 * People walking only change `placeActors`, so this is worked out once per set of rooms.
 */
export interface PreparedScene {
  layout: ShipLayout;
  rooms: SceneRooms;
  /** Every tile sprite, in the original order (`baseOrder`). */
  statics: (PlacedSprite & Sortable)[];
  /** Each static as it is returned, without the sorting fields. */
  plain: ReadonlyMap<PlacedSprite, PlacedSprite>;
  /** "Draws before" pairs between statics, as indices into `statics`: first, second, first, second... */
  edges: number[];
  /** Indices into `statics`, by `left`; and the widest static, to bound the search for what a person overlaps. */
  byLeft: number[];
  maxWidth: number;
}

export function prepareScene(layout: ShipLayout, rooms: SceneRooms): PreparedScene {
  const drawn = new Set(rooms.map((r) => r.room.id));
  const statics = rooms.flatMap((r, scene) => tileSortables(layout, r, scene, drawn)).sort(baseOrder);
  markTees(layout, statics);
  const byLeft = leftOrder(statics);
  const edges: number[] = [];
  for (let p = 0; p < byLeft.length; p++) {
    const i = byLeft[p]!;
    for (let q = p + 1; q < byLeft.length; q++) {
      const j = byLeft[q]!;
      if (statics[j]!.left >= statics[i]!.left + statics[i]!.width) break;
      link(statics, i, j, edges);
    }
  }
  const plain = new Map(statics.map((s) => [s, unsorted(s)]));
  return { layout, rooms, statics, plain, edges, byLeft, maxWidth: statics.reduce((m, s) => Math.max(m, s.width), 0) };
}

/**
 * The prepared scene with people in it (`actors[i]` stand in `rooms[i]`): the same sprites and
 * paint order `placeScene` gives, without redoing what only depends on the tiles.
 */
export function placeActors(prepared: PreparedScene, actors: readonly (readonly Actor[])[]): PlacedSprite[] {
  return placeWithSlots(prepared, actors, []).sprites;
}

/**
 * Where something drawn on one floor cell of the first room (fire) goes in the paint order: before
 * the sprite whose `order` is `order` (after everything when it equals the sprite count).
 */
export interface CellSlot {
  cell: { x: number; y: number };
  order: number;
}

/**
 * The screen box a cell's slot is sorted with, from the cell's anchor: about a cell and a half wide
 * and rising three cells, which covers fire drifting over its cell and the smoke going up from it.
 */
const SLOT_BOX = { dx: -24, dy: -40, width: 48, height: 56 } as const;

/**
 * `placeActors`, plus a slot in the paint order for each of `cells` (floor cells of the first room,
 * on its own grid). Each is sorted after the sprites are, as a one-cell thing on the floor would be
 * against what overlaps it on screen, so it moves nothing else: it goes right after the last sprite
 * that must be behind it. Someone standing on the cell is drawn over it. If what must be behind
 * and what must be in front cross (sprites the sort didn't have to order), it goes before the first
 * that must be in front, so walls and furniture cover it rather than it covering them.
 */
export function placeWithSlots(prepared: PreparedScene, actors: readonly (readonly Actor[])[], cells: readonly { x: number; y: number }[]): { sprites: PlacedSprite[]; slots: CellSlot[] } {
  const { layout, rooms, statics, plain, edges, byLeft, maxWidth } = prepared;
  const people = rooms.flatMap((r, scene) => actorSortables(layout, r, scene, actors[scene] ?? [])).sort(baseOrder);
  // Merge the two sorted lists. A static wins a tie: it came first in the original's stable sort.
  const base: (PlacedSprite & Sortable)[] = [];
  const atStatic = new Array<number>(statics.length), atPerson = new Array<number>(people.length);
  for (let i = 0, j = 0; i < statics.length || j < people.length; ) {
    if (j >= people.length || (i < statics.length && baseOrder(statics[i]!, people[j]!) <= 0)) {
      atStatic[i] = base.length;
      base.push(statics[i++]!);
    } else {
      atPerson[j] = base.length;
      base.push(people[j++]!);
    }
  }
  const pairs: number[] = [];
  for (let k = 0; k < edges.length; k++) pairs.push(atStatic[edges[k]!]!);
  // Each person against the statics that can overlap them, then against each other.
  const lefts = byLeft.map((i) => statics[i]!.left);
  people.forEach((a, pa) => {
    const from = lowerBound(lefts, a.left - maxWidth);
    for (let q = from; q < lefts.length && lefts[q]! < a.left + a.width; q++) link(base, atPerson[pa]!, atStatic[byLeft[q]!]!, pairs);
    for (let pb = pa + 1; pb < people.length; pb++) link(base, atPerson[pa]!, atPerson[pb]!, pairs);
  });
  const ordered = paintOrder(base, pairs);
  markOccluded(ordered);
  const slots = cells.length ? cellSlots(ordered, people, statics, byLeft, lefts, maxWidth, cells) : [];
  return { sprites: ordered.map((s, order) => ({ ...(plain.get(s) ?? unsorted(s)), order })), slots };
}

function cellSlots(
  ordered: readonly (PlacedSprite & Sortable)[],
  people: readonly (PlacedSprite & Sortable)[],
  statics: readonly (PlacedSprite & Sortable)[],
  byLeft: readonly number[],
  lefts: readonly number[],
  maxWidth: number,
  cells: readonly { x: number; y: number }[],
): CellSlot[] {
  const at = new Map<PlacedSprite & Sortable, number>();
  for (const [i, s] of ordered.entries()) at.set(s, i);
  return cells.map(({ x, y }) => {
    const anchor = gridToPx(x, y);
    const v: PlacedSprite & Sortable = {
      key: "",
      room: "",
      kind: "actor",
      cell: { x, y },
      left: anchor.x + SLOT_BOX.dx,
      top: anchor.y + SLOT_BOX.dy,
      width: SLOT_BOX.width,
      height: SLOT_BOX.height,
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
      scene: 0,
      box: { x0: x, x1: x, y0: y, y1: y },
      shape: "solid",
    };
    let lo = 0, hi = ordered.length;
    const against = (s: PlacedSprite & Sortable) => {
      if (s.left >= v.left + v.width || v.left >= s.left + s.width || s.top >= v.top + v.height || v.top >= s.top + s.height) return;
      let c = compare(v, s);
      // Someone standing on the cell (or lying on it) is drawn over what burns there.
      if (c === 0 && s.kind === "actor" && boxesOverlap(v, s)) c = -1;
      const i = at.get(s)!;
      if (c > 0) lo = Math.max(lo, i + 1);
      else if (c < 0) hi = Math.min(hi, i);
    };
    for (let q = lowerBound(lefts, v.left - maxWidth); q < lefts.length && lefts[q]! < v.left + v.width; q++) against(statics[byLeft[q]!]!);
    for (const p of people) against(p);
    return { cell: { x, y }, order: lo <= hi ? lo : hi };
  });
}

/** A sprite without the fields only sorting uses. */
const unsorted = ({ pass, depth, prio, stage, screenX, scene, box, shape, under, ...s }: PlacedSprite & Sortable): PlacedSprite => s;

/** Indices of `sprites` by `left`, a tie going to the earlier one. */
const leftOrder = (sprites: readonly PlacedSprite[]) => sprites.map((_, i) => i).sort((i, j) => sprites[i]!.left - sprites[j]!.left || i - j);

/** First index in sorted `xs` whose value is greater than `v`. */
function lowerBound(xs: readonly number[], v: number): number {
  let lo = 0, hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * If sprites i and j overlap on screen and `compare` orders them, adds the pair (first, second) to
 * `pairs`. They are taken left to right (the earlier one at a tie), as the sweep meets them.
 */
function link(sprites: readonly (PlacedSprite & Sortable)[], i: number, j: number, pairs: number[]) {
  const si = sprites[i]!, sj = sprites[j]!;
  const [x, a, y, b] = sj.left < si.left || (sj.left === si.left && j < i) ? [j, sj, i, si] : [i, si, j, sj];
  if (b.left >= a.left + a.width || b.top >= a.top + a.height || a.top >= b.top + b.height) return;
  const c = compare(a, b);
  if (c !== 0) pairs.push(...(c < 0 ? [x, y] : [y, x]));
}

function tileSortables(
  layout: ShipLayout,
  { room, dx, dy }: SceneRooms[number],
  scene: number,
  drawn: ReadonlySet<string>,
): (PlacedSprite & Sortable)[] {
  const placed: (PlacedSprite & Sortable)[] = [];
  const prefix = scene === 0 ? "" : `${room.id}/`;
  const floor = floorBounds(room, dx, dy);

  const place = (t: TilePlacement, key: string) => {
    const frontDoor = FRONT_DOORS.has(t.slice);
    const slice = layout.slices[t.slice]!;
    const x = t.x + dx, y = t.y + dy;
    const anchor = gridToPx(x, y);
    const isEntity = t.kind === "entity";
    const decal = slice.flags.includes("decal") || slice.flags.includes("chair");
    const [w, h] = slice.footprint ?? [1, 1];
    const inFront = isEntity && CHAIRS_IN_FRONT.has(`${room.id}:${t.x},${t.y}`);
    const flat = t.kind === "ground" || frontDoor || (slice.flags.includes("decal") && !slice.flags.includes("chair"));
    placed.push({
      key,
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
      depth: x + y + (inFront ? 3 : 0),
      prio: isEntity ? (decal ? PRIO.decal : PRIO.entity) : PRIO.tile,
      stage: t.kind === "ground" ? 0 : t.kind === "prop" ? 2 : 1,
      screenX: anchor.x,
      scene,
      // Bay doors sit in the back wall row off the floor; clipping them onto floor.y0 makes them overlap and cover furniture on that row.
      box: t.kind === "ground" || t.kind === "wall" || t.kind === "door" || t.slice === "bay_window" || t.slice === "bay_window_upgrade"
        ? { x0: x - w + 1, x1: x, y0: y - h + 1, y1: y }
        : clip(x - w + 1, x, y - h + 1 + (inFront ? 1 : 0), y + (inFront ? 1 : 0), floor),
      shape: flat ? "flat" : t.kind === "wall" || t.kind === "door" ? "wall" : "solid",
    });
  };

  room.tiles.forEach((t, i) => {
    if (FRONT_DOORS.has(t.slice) && t.door && drawn.has(t.door.target)) return;
    place(t, `${prefix}t${i}`);
  });
  return placed;
}

function actorSortables(layout: ShipLayout, { room, dx, dy }: SceneRooms[number], scene: number, actors: readonly Actor[]): (PlacedSprite & Sortable)[] {
  const placed: (PlacedSprite & Sortable)[] = [];
  for (const a of actors) {
    const x = a.cell.x + dx, y = a.cell.y + dy;
    const anchor = gridToPx(x, y);
    const lift = groundOffsetAt(layout, room, a.cell.x, a.cell.y);
    const inFront = CHAIRS_IN_FRONT.has(`${room.id}:${a.cell.x},${a.cell.y}`);
    placed.push({
      key: `a:${a.id}`,
      room: room.id,
      kind: "actor",
      cell: { x, y },
      left: anchor.x + ACTOR_OFFSET.x - a.width / 2 + (a.shift?.x ?? 0),
      top: anchor.y + ACTOR_OFFSET.y - a.height / 2 - lift + (a.shift?.y ?? 0),
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
      depth: x + y + (inFront ? 3 : 0),
      prio: PRIO.entity,
      stage: 0,
      screenX: anchor.x,
      scene,
      box: inFront ? { x0: x, x1: x, y0: y + 1, y1: y + 1 } : { x0: x, x1: x, y0: y, y1: y },
      shape: "solid",
      ...(a.onTop && { onTop: true }),
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
 * At a tie, the room you're in draws over the others, and entities whose footprint reaches
 * further back draw before smaller ones on the same front corner (SweepRenderer.sortFunc).
 */
const baseOrder = (a: Sortable, b: Sortable) =>
  a.pass - b.pass ||
  a.depth - b.depth ||
  b.prio - a.prio ||
  a.screenX - b.screenX ||
  a.stage - b.stage ||
  b.scene - a.scene ||
  (a.pass === PASS.entity ? a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0 : 0);

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
  // A wall stopping at a T goes under the room whose wall it runs into, but over its floor (`markTees`).
  if (a.under && a.under === b.room && b.kind !== "ground" && !b.under) return -1;
  if (b.under && b.under === a.room && a.kind !== "ground" && !a.under) return 1;
  const standing = (a.shape === "wall" && b.shape === "solid") || (b.shape === "wall" && a.shape === "solid");
  if (a.scene === b.scene && !standing) {
    if (a.pass !== PASS.entity || b.pass !== PASS.entity) return baseOrder(a, b);
    // Someone lying in a bed is over the bed (which overlaps their cell), not behind it.
    const lyingA = a.onTop && b.kind !== "actor" && b.shape === "solid", lyingB = b.onTop && a.kind !== "actor" && a.shape === "solid";
    if ((lyingA || lyingB) && boxesOverlap(a, b)) return lyingA ? 1 : -1;
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
 * Paint order: a topological sort of "draws before" (`pairs`, from `link`: every pair of
 * sprites whose boxes overlap on screen that `compare` orders), taking the earliest in
 * the original order (`base`, sorted by `baseOrder`) whenever there's a choice. A cycle,
 * which the rules above can make in odd corners, is broken at its earliest sprite (found by
 * walking back from a stuck sprite, so sprites merely waiting on a cycle keep
 * their own constraints).
 */
function paintOrder<S extends PlacedSprite & Sortable>(base: S[], pairs: readonly number[]): S[] {
  const n = base.length;
  // Who each sprite must draw before, as one flat list: after[start[i]..start[i + 1]) for sprite i.
  const start = new Int32Array(n + 1);
  const waiting = new Int32Array(n);
  for (let k = 0; k < pairs.length; k += 2) {
    start[pairs[k]! + 1]!++;
    waiting[pairs[k + 1]!]!++;
  }
  for (let i = 0; i < n; i++) start[i + 1]! += start[i]!;
  const after = new Int32Array(pairs.length / 2);
  const fill = start.slice(0, n);
  for (let k = 0; k < pairs.length; k += 2) after[fill[pairs[k]!]!++] = pairs[k + 1]!;
  // Who each sprite waits on, only needed to break a cycle.
  let before: number[][] | undefined;
  const predecessors = () => {
    if (!before) {
      before = base.map(() => []);
      for (let k = 0; k < pairs.length; k += 2) before[pairs[k + 1]!]!.push(pairs[k]!);
    }
    return before;
  };
  // Rank by `left`, only needed to break a cycle: the walk back takes predecessors in the order a
  // left-to-right sweep would meet the pairs, so it doesn't depend on how the pairs were gathered.
  let rank: number[] | undefined;
  const sweepRank = () => {
    if (!rank) {
      rank = new Array<number>(n);
      leftOrder(base).forEach((i, r) => {
        rank![i] = r;
      });
    }
    return rank;
  };

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
  const done = new Uint8Array(n);
  const out: S[] = [];
  let next = 0; // Lowest index that might not be drawn yet, for breaking cycles.
  while (out.length < n) {
    if (heap.length === 0) {
      while (done[next]) next++;
      const cut = cycleStart(next, predecessors(), done, sweepRank());
      waiting[cut] = 0;
      push(cut);
    }
    const i = pop();
    if (done[i]) continue;
    done[i] = 1;
    out.push(base[i]!);
    for (let k = start[i]!; k < start[i + 1]!; k++) {
      const j = after[k]!;
      if (--waiting[j]! === 0 && !done[j]) push(j);
    }
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
    for (let k = i + 1; k < ordered.length; k++) {
      const s = ordered[k]!;
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
function cycleStart(from: number, before: readonly number[][], done: Uint8Array, rank: readonly number[]): number {
  const seen = new Map<number, number>();
  const path: number[] = [];
  let v = from;
  // Pairs in sweep order: by the lower rank of the two, then the higher.
  const key = (u: number, w: number) => Math.min(rank[u]!, rank[w]!) * before.length + Math.max(rank[u]!, rank[w]!);
  while (!seen.has(v)) {
    seen.set(v, path.length);
    path.push(v);
    const w = v;
    v = before[w]!.filter((u) => !done[u]).reduce((best, u) => (key(u, w) < key(best, w) ? u : best));
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
 * by any entity footprint except decals and chairs, and with no wall on it (the
 * original's cells held floor or wall, never both; the map has floor under some
 * walls where rooms meet). Footprints extend from the anchor toward -x/-y
 * (Ship.buildRoomBmp mkDep/mkDoor).
 */
export function walkableCells(layout: ShipLayout, room: RoomLayout): { x: number; y: number }[] {
  const blocked = new Set<string>();
  for (const t of room.tiles) {
    const slice = layout.slices[t.slice]!;
    if (t.kind === "wall") blocked.add(`${t.x},${t.y}`);
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
 * Where someone at the terminal `equipment` (an `occupancy` spot, #192) is drawn: on its chair number `chair` if
 * the map has that chair (`chairs` on its binding), with the chair's direction ("" for a stool), or else at its
 * standing spot. A chair's cell may be off the floor, under the console or turret it belongs to (`offFloorStep`
 * gets you onto it). Undefined if the room doesn't draw that equipment. Display only.
 */
export function terminalSpot(
  layout: ShipLayout,
  room: RoomLayout,
  equipment: string,
  chair: number | undefined,
  cells: readonly { x: number; y: number }[],
): { cell: { x: number; y: number }; chair?: string } | undefined {
  const placed = placedEquipment(room).find((e) => e.id === equipment);
  if (!placed) return undefined;
  const seat = chair === undefined ? undefined : placed.chairs?.[chair];
  const t = seat && room.tiles.find((t) => t.kind === "entity" && t.x === seat.x && t.y === seat.y && layout.slices[t.slice]?.flags.includes("chair"));
  if (seat && t && cells.length > 0) return { cell: { x: seat.x, y: seat.y }, chair: layout.slices[t.slice]?.dir ?? "" };
  const cell = standSpot(layout, room, placed.tile, cells);
  return cell && { cell };
}

/**
 * Where someone lying in the bed drawn by tile `tile` goes, as the original did (HumanNPC.layDown): on the bed tile's
 * cell, shifted by its binding's `ofsx`/`ofsy` pixels, mirrored when the binding says `flipped`. A bed with no such data
 * (a built sofa) has them in the middle of its footprint, mirrored to run along it. Display only.
 */
export function lyingPose(layout: ShipLayout, room: RoomLayout, tile: number): { cell: { x: number; y: number }; shift?: { x: number; y: number }; flip: boolean } | undefined {
  const t = room.tiles[tile];
  if (!t) return undefined;
  const placed = placedEquipment(room).find((e) => e.tile === tile);
  const data = placed && room.equipment.find((b) => `${room.id}:${b.key ?? b.id}` === placed.id)?.data;
  if (data) {
    const parts = data.split(";");
    const num = (name: string) => Number(parts.find((p) => p.startsWith(`${name}_`))?.split("_")[1] ?? 0) || 0;
    return { cell: { x: t.x, y: t.y }, shift: { x: num("ofsx"), y: num("ofsy") }, flip: parts.includes("flipped") };
  }
  const [w, h] = layout.slices[t.slice]?.footprint ?? [1, 1];
  return { cell: { x: t.x - Math.floor((w - 1) / 2), y: t.y - Math.floor((h - 1) / 2) }, flip: w > h };
}

/**
 * Getting to a cell off the floor (a seat inside a turret, under its footprint, #192): the floor cell nearest it, to
 * walk to, from which you climb in (`stepsOnto`). Undefined for a cell on the floor, or a room with none.
 */
export function offFloorStep(cells: readonly { x: number; y: number }[], cell: { x: number; y: number }): { x: number; y: number } | undefined {
  if (cells.some((c) => c.x === cell.x && c.y === cell.y)) return undefined;
  const dist = (c: { x: number; y: number }) => Math.abs(c.x - cell.x) + Math.abs(c.y - cell.y);
  return [...cells].sort((a, b) => dist(a) - dist(b) || a.x - b.x || a.y - b.y)[0];
}

/** The cells from `from` (left out) to `to`, a step at a time along x and then y: a way across what isn't floor. */
export function stepsOnto(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number }[] {
  const steps: { x: number; y: number }[] = [];
  let { x, y } = from;
  while (x !== to.x) steps.push({ x: (x += Math.sign(to.x - x)), y });
  while (y !== to.y) steps.push({ x, y: (y += Math.sign(to.y - y)) });
  return steps;
}

/**
 * The shortest walk from `from` to `to` over walkable cells, both ends included, stepping along the
 * grid axes only: a stylistic choice, like the original's staircase walks (`diagonal` allows
 * diagonal steps too). Undefined when either end is off the floor or there is no way through.
 * Display only, like walking itself.
 */
export function walkPath(
  cells: readonly { x: number; y: number }[],
  from: { x: number; y: number },
  to: { x: number; y: number },
  diagonal = false,
): { x: number; y: number }[] | undefined {
  const key = (c: { x: number; y: number }) => `${c.x},${c.y}`;
  const walkable = new Set(cells.map(key));
  if (!walkable.has(key(from)) || !walkable.has(key(to))) return undefined;
  const cameFrom = new Map<string, { x: number; y: number } | null>([[key(from), null]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]!;
    if (c.x === to.x && c.y === to.y) {
      const path = [];
      for (let p: { x: number; y: number } | null | undefined = c; p; p = cameFrom.get(key(p))) path.push({ x: p.x, y: p.y });
      return path.reverse();
    }
    const steps = [{ x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 }];
    if (diagonal) steps.push({ x: c.x + 1, y: c.y + 1 }, { x: c.x + 1, y: c.y - 1 }, { x: c.x - 1, y: c.y + 1 }, { x: c.x - 1, y: c.y - 1 });
    for (const n of steps) {
      if (walkable.has(key(n)) && !cameFrom.has(key(n))) {
        cameFrom.set(key(n), c);
        queue.push(n);
      }
    }
  }
  return undefined;
}

/**
 * The walkable cell nearest the door from `room` to `target`, where someone coming in through it
 * first stands. Undefined if the room has no such door. Display only.
 */
export function doorSpot(
  layout: ShipLayout,
  room: RoomLayout,
  target: string,
  cells: readonly { x: number; y: number }[],
): { x: number; y: number } | undefined {
  const door = room.tiles.find((t) => t.door?.target === target);
  if (!door || cells.length === 0) return undefined;
  // The middle of its footprint, which extends from the anchor toward -x/-y.
  const [w, h] = layout.slices[door.slice]?.footprint ?? [1, 1];
  const cx = door.x - (w - 1) / 2, cy = door.y - (h - 1) / 2;
  const dist = (c: { x: number; y: number }) => Math.hypot(c.x - cx, c.y - cy);
  return [...cells].sort((a, b) => dist(a) - dist(b) || a.x - b.x || a.y - b.y)[0];
}

/** A step of a walk through a door: `door` marks the doorway's cells, with the key of the door sprite drawn there. */
export type DoorStep = { x: number; y: number; door?: string };

/**
 * The way through the door between the scene's first room and `to`, in scene cells: from the cell
 * in front of the door on `to`'s side (its `doorSpot`), through the doorway, to the one on this
 * side. The doorway is the drawn door's two cells, whichever room's wall holds it (one that opens,
 * if there is one); its steps carry that door's key. It is the same walk seen from either room, so
 * someone crossing over steps into the next room's view where they left the last. Undefined when
 * `to` isn't in the scene or there is no way across. Display only, like walking.
 */
export function doorPassage(prepared: PreparedScene, cells: readonly { x: number; y: number }[], to: string): DoorStep[] | undefined {
  const { layout, rooms, statics } = prepared;
  const here = rooms[0]?.room, there = rooms.find((r) => r.room.id === to), farRoom = layout.rooms.find((r) => r.id === to);
  if (!here || !there || !farRoom) return undefined;
  const shift = (c: { x: number; y: number }) => ({ x: c.x + there.dx, y: c.y + there.dy });
  const farCells = walkableCells(layout, farRoom);
  const near = doorSpot(layout, here, to, cells);
  const farSpot = doorSpot(layout, farRoom, here.id, farCells);
  if (!near || !farSpot) return undefined;
  const far = shift(farSpot);
  // The drawn door between the two rooms (a front door is left out once the room behind it is drawn).
  const between = (s: PlacedSprite) => (s.room === here.id && s.door?.target === to) || (s.room === to && s.door?.target === here.id);
  const sprite = statics.find((s) => between(s) && (layout.slices[s.slice]?.anims.length ?? 0) >= 2) ?? statics.find(between);
  if (!sprite) return undefined;
  const footprint = (slice: string, x: number, y: number) => {
    const [w, h] = layout.slices[slice]?.footprint ?? [1, 1];
    return Array.from({ length: w * h }, (_, k) => ({ x: x - (k % w), y: y - Math.floor(k / w) }));
  };
  const doorCells = footprint(sprite.slice, sprite.cell.x, sprite.cell.y);
  const doorway = new Set(doorCells.map((c) => `${c.x},${c.y}`));
  const floor = [...cells, ...walkableCells(layout, here), ...farCells.map(shift), ...walkableCells(layout, there.room).map(shift), ...doorCells];
  // A front door under the drawn one isn't drawn but still blocks the floor; it can sit a cell off the drawn door.
  const frontDoors = [
    ...here.tiles.filter((t) => t.door?.target === to).flatMap((t) => footprint(t.slice, t.x, t.y)),
    ...farRoom.tiles.filter((t) => t.door?.target === here.id).flatMap((t) => footprint(t.slice, t.x, t.y).map(shift)),
  ];
  // Through the drawn doorway if possible: along the grid, then with a diagonal step (where a floor
  // only meets the doorway at a corner), then over the front doors' cells too. Searched from the
  // same end whichever room it is seen from, so both views agree on the doorway cell.
  for (const [ground, diagonal] of [[floor, false], [floor, true], [[...floor, ...frontDoors], true]] as const) {
    const path = here.id < to ? walkPath(ground, near, far, diagonal)?.reverse() : walkPath(ground, far, near, diagonal);
    if (path?.some((c) => doorway.has(`${c.x},${c.y}`))) return path.map((c) => (doorway.has(`${c.x},${c.y}`) ? { ...c, door: sprite.key } : c));
  }
  return undefined;
}

/**
 * Rooms behind `room`'s doors, each with the grid shift from `room`'s cells to
 * its own, from where the ship plan puts both (`RoomLayout.at`, from
 * tools/src/shipLayout/roomPositions.ts). The plan is one grid for the whole
 * ship, so a room is in the same place whichever room you stand in; `npm run
 * ship-check` keeps it free of overlaps. Rooms without a matching door, or off
 * the plan, are left out.
 *
 * With a larger `depth` the rooms behind those rooms' doors follow (`ring` 2, 3, ...);
 * "all" keeps going until the whole ship is reached.
 */
export function neighborRooms(
  layout: ShipLayout,
  room: RoomLayout,
  depth: 1 | 2 | "all" = 1,
): { room: RoomLayout; dx: number; dy: number; ring: number }[] {
  const result: { room: RoomLayout; dx: number; dy: number; ring: number }[] = [];
  const origin = room.at;
  if (!origin) return result;
  const doorsOf = (from: RoomLayout, ring: number) => {
    for (const t of from.tiles) {
      const target = t.door?.target;
      if (!target || target === room.id || result.some((n) => n.room.id === target)) continue;
      const other = layout.rooms.find((r) => r.id === target);
      if (!other?.at || !other.tiles.some((b) => b.door?.target === from.id)) continue;
      result.push({ room: other, dx: other.at.x - origin.x, dy: other.at.y - origin.y, ring });
    }
  };
  doorsOf(room, 1);
  const last = depth === "all" ? Infinity : depth;
  for (let ring = 2, frontier = result.slice(); ring <= last && frontier.length; ring++) {
    const before = result.length;
    for (const n of frontier) doorsOf(n.room, ring);
    frontier = result.slice(before);
  }
  return result;
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
