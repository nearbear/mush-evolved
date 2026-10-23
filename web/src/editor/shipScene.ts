// The whole ship as the map editor draws it, and the shapes it lays over the art: pure, no DOM, so
// it is unit tested. Cells are on the ship plan (`RoomLayout.at`), as ship-check and the tests print
// them; pixels are placement's (`gridToPx`), before the scene box is taken off.

import type { RoomLayout, ShipLayout, TileKind, TilePlacement } from "@mush2/shared";
import { gridToPx, neighborRooms, type PlacedSprite, placeScene } from "../iso/placement.ts";

/** What the layer toggles show or hide, by tile kind. */
export const LAYERS = ["ground", "wall", "door", "prop", "entity"] as const satisfies readonly TileKind[];
export type Layer = (typeof LAYERS)[number];

export const layerOf = (kind: PlacedSprite["kind"]): Layer | undefined => (kind === "actor" ? undefined : kind);

/** Which rooms the editor draws: the whole ship, or what the game draws from one room at a fog depth. */
export type ShipView = { from: null } | { from: string; depth: 1 | 2 };

/**
 * The rooms on the ship plan in one scene, on ship cells. The whole ship is drawn as the game draws fog
 * depth "all" from the front corridor: the same rooms in the same order, so ties in paint order come
 * out the same. A view from a room draws that room and its neighbours out to the depth, as the game
 * does there (without the fog). Rooms off the plan (the patrol ships, the planet) aren't on it.
 */
export function shipScene(layout: ShipLayout, view: ShipView = { from: null }): PlacedSprite[] {
  const placed = layout.rooms.filter((r): r is RoomLayout & { at: { x: number; y: number } } => !!r.at);
  const root = placed.find((r) => r.id === (view.from ?? "CORRIDOR_A")) ?? placed[0];
  if (!root) return [];
  const order: RoomLayout[] = [root, ...neighborRooms(layout, root, view.from ? view.depth : "all").map((n) => n.room)];
  if (!view.from) for (const r of placed) if (!order.includes(r)) order.push(r);
  return placeScene(layout, order.map((room) => ({ room, dx: room.at!.x, dy: room.at!.y, actors: [] })));
}

/** Every sprite with an opaque pixel at (x, y), front first: what Tab cycles through. */
export function hitAll<S extends Pick<PlacedSprite, "left" | "top" | "width" | "height" | "flipX" | "flipY">>(
  sprites: readonly S[],
  x: number,
  y: number,
  opaque: (sprite: S, px: number, py: number) => boolean,
): S[] {
  const hits: S[] = [];
  for (let i = sprites.length - 1; i >= 0; i--) {
    const s = sprites[i]!;
    const lx = Math.floor(x - s.left), ly = Math.floor(y - s.top);
    if (lx < 0 || ly < 0 || lx >= s.width || ly >= s.height) continue;
    if (opaque(s, s.flipX ? s.width - 1 - lx : lx, s.flipY ? s.height - 1 - ly : ly)) hits.push(s);
  }
  return hits;
}

/** A tile in the map, as the editor names it. */
export interface TileRef {
  room: RoomLayout;
  /** Index into the room's `tiles`. */
  index: number;
  tile: TilePlacement;
}

/** The map tile a placed sprite draws ("t3" in the first room, "ROOM/t3" in the others). */
export function tileOf(layout: ShipLayout, s: PlacedSprite): TileRef | undefined {
  const room = layout.rooms.find((r) => r.id === s.room);
  const index = Number(s.key.split("/").pop()!.slice(1));
  const tile = room?.tiles[index];
  return room && tile ? { room, index, tile } : undefined;
}

/** The cell whose diamond holds placement pixel (x, y): `gridToPx` turned around (a cell's anchor is its top corner). */
export function cellAt(x: number, y: number): { x: number; y: number } {
  const a = x / 16, b = y / 8;
  return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
}

const pt = (x: number, y: number) => {
  const p = gridToPx(x, y);
  return `${p.x},${p.y}`;
};

/** An SVG path of the cells' diamonds. */
export const diamonds = (cells: readonly { x: number; y: number }[]) =>
  cells.map(({ x, y }) => `M${pt(x, y)}L${pt(x + 1, y)}L${pt(x + 1, y + 1)}L${pt(x, y + 1)}Z`).join("");

/** The cells a tile covers on the ship plan: its footprint, from its anchor toward -x/-y. */
export function footprint(layout: ShipLayout, room: RoomLayout, tile: TilePlacement): { x: number; y: number }[] {
  const [w, h] = layout.slices[tile.slice]?.footprint ?? [1, 1];
  const at = room.at ?? { x: 0, y: 0 };
  const cells: { x: number; y: number }[] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cells.push({ x: tile.x + at.x - i, y: tile.y + at.y - j });
  return cells;
}

/** Each room's floor outline (an SVG path along the edges of its floor) and where its name goes. */
export function roomOutlines(layout: ShipLayout): { id: string; label: string; path: string; x: number; y: number }[] {
  return layout.rooms.flatMap((room) => {
    if (!room.at) return [];
    const floor = new Set<string>();
    for (const t of room.tiles) if (t.kind === "ground") floor.add(`${t.x + room.at.x},${t.y + room.at.y}`);
    if (!floor.size) return [];
    let path = "", sx = 0, sy = 0;
    for (const k of floor) {
      const [x, y] = k.split(",").map(Number) as [number, number];
      sx += x + 0.5;
      sy += y + 0.5;
      if (!floor.has(`${x - 1},${y}`)) path += `M${pt(x, y)}L${pt(x, y + 1)}`;
      if (!floor.has(`${x + 1},${y}`)) path += `M${pt(x + 1, y)}L${pt(x + 1, y + 1)}`;
      if (!floor.has(`${x},${y - 1}`)) path += `M${pt(x, y)}L${pt(x + 1, y)}`;
      if (!floor.has(`${x},${y + 1}`)) path += `M${pt(x, y + 1)}L${pt(x + 1, y + 1)}`;
    }
    const c = gridToPx(sx / floor.size, sy / floor.size);
    return [{ id: room.id, label: room.label, path, x: c.x, y: c.y }];
  });
}

/** The cells the ship plan's rooms cover, inclusive. */
export function shipCells(layout: ShipLayout): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of layout.rooms) {
    if (!r.at) continue;
    for (const t of r.tiles) {
      x0 = Math.min(x0, t.x + r.at.x);
      y0 = Math.min(y0, t.y + r.at.y);
      x1 = Math.max(x1, t.x + r.at.x);
      y1 = Math.max(y1, t.y + r.at.y);
    }
  }
  return { x0, y0, x1, y1 };
}

/** The grid lines over `cells`: every cell edge (`minor`), and every fifth (`major`), as SVG paths. */
export function gridLines({ x0, y0, x1, y1 }: ReturnType<typeof shipCells>): { minor: string; major: string } {
  let minor = "", major = "";
  for (let y = y0; y <= y1 + 1; y++) {
    const line = `M${pt(x0, y)}L${pt(x1 + 1, y)}`;
    if (y % 5 === 0) major += line;
    else minor += line;
  }
  for (let x = x0; x <= x1 + 1; x++) {
    const line = `M${pt(x, y0)}L${pt(x, y1 + 1)}`;
    if (x % 5 === 0) major += line;
    else minor += line;
  }
  return { minor, major };
}
