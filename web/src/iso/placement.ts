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
 * after all tiles, so walls never cover furniture or people.
 */
const PASS = { prewall: 0, tile: 1, postwall: 2, entity: 3, post: 4 } as const;

/** Within a pass at equal depth, higher priority draws behind (IsoConst). */
const PRIO = { tile: 10, decal: 5, entity: 0 } as const;

export interface PlacedSprite {
  key: string;
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
  const placed: (PlacedSprite & Sortable)[] = [];

  room.tiles.forEach((t, i) => {
    const slice = layout.slices[t.slice]!;
    const anchor = gridToPx(t.x, t.y);
    const isEntity = t.kind === "entity";
    const decal = slice.flags.includes("decal") || slice.flags.includes("chair");
    placed.push({
      key: `t${i}`,
      kind: t.kind,
      cell: { x: t.x, y: t.y },
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
      depth: t.x + t.y,
      prio: isEntity ? (decal ? PRIO.decal : PRIO.entity) : PRIO.tile,
      stage: t.kind === "ground" ? 0 : t.kind === "prop" ? 2 : 1,
      screenX: anchor.x,
    });
  });

  for (const a of actors) {
    const anchor = gridToPx(a.cell.x, a.cell.y);
    const lift = groundOffsetAt(layout, room, a.cell.x, a.cell.y);
    placed.push({
      key: `a:${a.id}`,
      kind: "actor",
      cell: a.cell,
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
      depth: a.cell.x + a.cell.y,
      prio: PRIO.entity,
      stage: 0,
      screenX: anchor.x,
    });
  }

  placed.sort(
    (a, b) =>
      a.pass - b.pass ||
      a.depth - b.depth ||
      b.prio - a.prio ||
      a.screenX - b.screenX ||
      a.stage - b.stage,
  );
  return placed.map(({ pass, depth, prio, stage, screenX, ...s }, order) => ({ ...s, order }));
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
