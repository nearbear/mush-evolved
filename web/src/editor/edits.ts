// Changes to the ship map as the editor makes them. Pure: each returns a new map that shares every room
// it didn't touch, so undo is a list of maps. A tile is named by its room and its index in the room's
// tiles; deleting one shifts the indices after it, and new tiles go at the end (equipment bindings
// claim the first tile with their sprite, `placedEquipment`, so appending never takes one over).

import { EQUIPMENT_TYPES, placedEquipment, type RoomLayout, type ShipArt, type ShipMap, type TileKind, type TilePlacement } from "@mush2/shared";

export interface TileAt {
  room: string;
  index: number;
}

/** The arrow keys, by screen direction (`gridToPx`: +x is down-right, +y down-left). */
export const ARROWS: Readonly<Record<string, { dx: number; dy: number; label: string }>> = {
  ArrowUp: { dx: 0, dy: -1, label: "up-right (−y)" },
  ArrowRight: { dx: 1, dy: 0, label: "down-right (+x)" },
  ArrowDown: { dx: 0, dy: 1, label: "down-left (+y)" },
  ArrowLeft: { dx: -1, dy: 0, label: "up-left (−x)" },
};

/**
 * One step of a sleeper nudge, in screen pixels, by arrow key: half a cell along that arrow's grid axis
 * (2 across, 1 down: the smallest move that stays straight along or across a bed), or one pixel up, down,
 * left or right for `fine`.
 */
export function sleeperStep(key: string, fine: boolean): { x: number; y: number } | undefined {
  const a = ARROWS[key];
  if (!a) return undefined;
  if (fine) return { ArrowUp: { x: 0, y: -1 }, ArrowRight: { x: 1, y: 0 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 } }[key];
  // `gridToPx`: a cell along +x is (16, 8) on screen, along +y (-16, 8).
  return { x: 2 * (a.dx - a.dy), y: a.dx + a.dy };
}

/**
 * The bed drawn by tile `at` and its binding's data, when the binding has some (the original's
 * `flipped;ofsx_N;ofsy_N`, which `lyingPose` reads). A bed without data (a built sofa) is undefined:
 * the game puts its sleeper in the middle of the footprint, and giving it data would change that.
 */
export function sleeperData(map: ShipMap, at: TileAt): { binding: number; data: string; x: number; y: number } | undefined {
  const room = map.rooms.find((r) => r.id === at.room);
  const placed = room && placedEquipment(room).find((e) => e.tile === at.index);
  if (!room || !placed || !EQUIPMENT_TYPES[placed.type]?.bed) return undefined;
  const binding = room.equipment.findIndex((b) => `${room.id}:${b.key ?? b.id}` === placed.id);
  const data = room.equipment[binding]?.data;
  if (!data) return undefined;
  const num = (name: string) => Number(data.split(";").find((p) => p.startsWith(`${name}_`))?.split("_")[1] ?? 0) || 0;
  return { binding, data, x: num("ofsx"), y: num("ofsy") };
}

/** The sleeper in the bed at `at` moved (dx, dy) screen pixels: only its `ofsx`/`ofsy` change, the rest of the data stays. */
export function nudgeSleeper(map: ShipMap, at: TileAt, dx: number, dy: number): ShipMap {
  const now = sleeperData(map, at);
  if (!now) return map;
  const set = { ofsx: now.x + dx, ofsy: now.y + dy };
  const parts = now.data.split(";").map((p) => {
    const name = p.split("_")[0] as keyof typeof set;
    return name in set && p.startsWith(`${name}_`) ? `${name}_${set[name]}` : p;
  });
  for (const name of ["ofsx", "ofsy"] as const) if (!parts.some((p) => p.startsWith(`${name}_`))) parts.push(`${name}_${set[name]}`);
  const data = parts.join(";");
  return withRoom(map, at.room, (r) => ({ ...r, equipment: r.equipment.map((b, i) => (i === now.binding ? { ...b, data } : b)) }));
}

export const tileAt = (map: ShipMap, at: TileAt): TilePlacement | undefined => map.rooms.find((r) => r.id === at.room)?.tiles[at.index];

const withRoom = (map: ShipMap, id: string, change: (room: RoomLayout) => RoomLayout): ShipMap => ({
  ...map,
  rooms: map.rooms.map((r) => (r.id === id ? change(r) : r)),
});

const withTile = (map: ShipMap, at: TileAt, change: (t: TilePlacement) => TilePlacement): ShipMap =>
  withRoom(map, at.room, (r) => ({ ...r, tiles: r.tiles.map((t, i) => (i === at.index ? change(t) : t)) }));

export const moveTile = (map: ShipMap, at: TileAt, dx: number, dy: number): ShipMap =>
  withTile(map, at, (t) => ({ ...t, x: t.x + dx, y: t.y + dy }));

export const deleteTile = (map: ShipMap, at: TileAt): ShipMap =>
  withRoom(map, at.room, (r) => ({ ...r, tiles: r.tiles.filter((_, i) => i !== at.index) }));

/** The whole room moved on the ship plan (its `at`), every tile with it. Rooms off the plan stay off it. */
export const moveRoom = (map: ShipMap, id: string, dx: number, dy: number): ShipMap =>
  withRoom(map, id, (r) => (r.at ? { ...r, at: { x: r.at.x + dx, y: r.at.y + dy } } : r));

/** A copy of the tile on the same cell, at the end of its room's tiles. */
export function duplicateTile(map: ShipMap, at: TileAt): { map: ShipMap; at: TileAt } {
  const t = tileAt(map, at)!;
  const room = map.rooms.find((r) => r.id === at.room)!;
  return { map: withRoom(map, at.room, (r) => ({ ...r, tiles: [...r.tiles, { ...t }] })), at: { room: at.room, index: room.tiles.length } };
}

/** The next or previous frame of the tile's slice, wrapping round. */
export function stepFrame(map: ShipMap, art: Pick<ShipArt, "slices">, at: TileAt, step: number): ShipMap {
  return withTile(map, at, (t) => {
    const s = art.slices[t.slice];
    const n = s ? s.framesX * s.framesY : 1;
    return { ...t, frame: (((t.frame + step) % n) + n) % n };
  });
}

/** The other way round for a sofa (`sofa` runs along y, `sofaReverse` along x), on the same cell; its binding follows. */
export function rotateSofa(map: ShipMap, at: TileAt): ShipMap {
  const from = tileAt(map, at)?.slice;
  const to = from === "sofa" ? "sofaReverse" : from === "sofaReverse" ? "sofa" : undefined;
  if (!to) return map;
  const turned = withTile(map, at, (t) => ({ ...t, slice: to }));
  return withRoom(turned, at.room, (r) => ({ ...r, equipment: r.equipment.map((b) => (b.id === "SOFA" && b.tile === from ? { ...b, tile: to } : b)) }));
}

export const setDoorTarget = (map: ShipMap, at: TileAt, target: string): ShipMap => withTile(map, at, (t) => ({ ...t, door: { target } }));

/**
 * The tile handed to another room, on the same ship cell (both rooms must be on the plan): it is drawn
 * with that room and lit as part of it. It goes at the end of the room's tiles. Equipment the tile
 * draws goes with it: its binding moves to the end of the other room's bindings, its chairs kept on
 * the same ship cells.
 */
export function moveToRoom(map: ShipMap, at: TileAt, to: string): { map: ShipMap; at: TileAt } | undefined {
  const from = map.rooms.find((r) => r.id === at.room);
  const dest = map.rooms.find((r) => r.id === to);
  const t = from?.tiles[at.index];
  if (!from?.at || !dest?.at || !t || to === at.room) return undefined;
  const dx = from.at.x - dest.at.x;
  const dy = from.at.y - dest.at.y;
  const moved = { ...t, x: t.x + dx, y: t.y + dy };
  const placed = placedEquipment(from).find((e) => e.tile === at.index);
  const bi = placed ? from.equipment.findIndex((b) => `${from.id}:${b.key ?? b.id}` === placed.id) : -1;
  const b = from.equipment[bi];
  const binding = b && { ...b, ...(b.chairs && { chairs: b.chairs.map((c) => ({ x: c.x + dx, y: c.y + dy })) }) };
  const without = withRoom(deleteTile(map, at), at.room, (r) => (binding ? { ...r, equipment: r.equipment.filter((_, i) => i !== bi) } : r));
  return {
    map: withRoom(without, to, (r) => ({ ...r, tiles: [...r.tiles, moved], ...(binding && { equipment: [...r.equipment, binding] }) })),
    at: { room: to, index: dest.tiles.length },
  };
}

/** A new tile on ship cell `cell`, in room `room` (which must be on the plan), at the end of its tiles. */
export function placeTile(map: ShipMap, room: string, cell: { x: number; y: number }, tile: Omit<TilePlacement, "x" | "y">): { map: ShipMap; at: TileAt } {
  const r = map.rooms.find((x) => x.id === room)!;
  const t = { x: cell.x - r.at!.x, y: cell.y - r.at!.y, ...tile };
  // A sofa is built-only equipment: bind it, so the game draws it only once someone builds one.
  // A binding whose sprite is no longer in the room (the old sofa was deleted to turn it) follows the new one.
  const isSofa = tile.slice === "sofa" || tile.slice === "sofaReverse";
  const bound = r.equipment.some((b) => b.id === "SOFA" && r.tiles.some((x) => x.slice === b.tile));
  const equipment = !isSofa || bound ? r.equipment : [...r.equipment.filter((b) => b.id !== "SOFA"), { id: "SOFA", tile: tile.slice }];
  return {
    map: withRoom(map, room, (x) => ({ ...x, tiles: [...x.tiles, t], equipment })),
    at: { room, index: r.tiles.length },
  };
}

/**
 * The kind and layer a new tile of `slice` gets: what the map already uses most for that slice, or
 * else what its flags say (walkable floor, a door, something with a footprint), and a prop otherwise.
 */
export function kindFor(map: ShipMap, art: Pick<ShipArt, "slices">, slice: string): Pick<TilePlacement, "kind" | "layer"> {
  const count = new Map<string, number>();
  for (const r of map.rooms) for (const t of r.tiles) if (t.slice === slice) count.set(`${t.kind}/${t.layer}`, (count.get(`${t.kind}/${t.layer}`) ?? 0) + 1);
  const best = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (best) {
    const [kind, layer] = best.split("/");
    return { kind: kind as TileKind, layer: Number(layer) as TilePlacement["layer"] };
  }
  const s = art.slices[slice];
  if (s?.flags.includes("pathable")) return { kind: "ground", layer: 0 };
  if (s?.flags.includes("door")) return { kind: "door", layer: 0 };
  if (s?.footprint) return { kind: "entity", layer: 2 };
  return { kind: "prop", layer: 1 };
}

/**
 * The room a new tile on ship cell `cell` most likely belongs to: the room with floor there, else one
 * with any tile there, else one with a tile on a cell next to it. Rooms off the plan never.
 */
export function roomForCell(map: ShipMap, cell: { x: number; y: number }): string | undefined {
  const on = (r: RoomLayout, x: number, y: number, floor: boolean) =>
    r.at && r.tiles.some((t) => t.x + r.at!.x === x && t.y + r.at!.y === y && (!floor || t.kind === "ground"));
  const { x, y } = cell;
  return (
    map.rooms.find((r) => on(r, x, y, true)) ??
    map.rooms.find((r) => on(r, x, y, false)) ??
    map.rooms.find((r) => [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([a, b]) => on(r, a!, b!, false)))
  )?.id;
}
