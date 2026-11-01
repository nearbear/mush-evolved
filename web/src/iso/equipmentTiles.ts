// Which room tile draws which piece of equipment. Shared by the room (clicks) and the Inspect panel (the sprite).

import { CAMERA_EQUIPMENT, EQUIPMENT_TYPES, placedEquipment, type EquipmentView, type RoomLayout, type ShipLayout, type TilePlacement } from "@mush2/shared";

/** Tile slices of the camera art, one tile per room in the layout. */
export const CAMERA_SLICES: ReadonlySet<string> = new Set(["camera", "camera2"]);

/** The built-only tiles (a sofa, the lab's MycoScan) each room of the stripped layout had in the map, by equipment type, where `roomAsBuilt` draws them. */
const builtTiles = new WeakMap<RoomLayout, ReadonlyMap<string, TilePlacement>>();

/**
 * The layout without the map's built-only equipment (each room's sofa, placed in the ship map editor; the lab's
 * MycoScan, where the original's upgrades.xml spawned it): it isn't there until someone builds it, and then
 * `roomAsBuilt` draws it where the map had it. Run once, when the layout loads. A room with no sofa tile in the map
 * (the Nexus, hydroponics: no wall with room for it) never draws one.
 */
export function withoutBuiltOnly(layout: ShipLayout): ShipLayout {
  const rooms = layout.rooms.map((room) => {
    const placed = placedEquipment(room).filter((p) => EQUIPMENT_TYPES[p.type]?.builtOnly);
    if (placed.length === 0) return room;
    const drop = new Set(placed.map((p) => p.tile));
    const stripped = { ...room, tiles: room.tiles.filter((_, i) => !drop.has(i)), equipment: room.equipment.filter((b) => !EQUIPMENT_TYPES[b.id]?.builtOnly) };
    builtTiles.set(stripped, new Map(placed.map((p) => [p.type, room.tiles[p.tile]!])));
    return stripped;
  });
  return { ...layout, rooms };
}

/**
 * The room as drawn: with each built-only piece at the map's spot once one of its type is built. Only one of a type
 * is drawn; a second sofa in the room works but isn't drawn (the original listed it on the shelf). The tiles go last,
 * so other tiles keep their indices.
 */
export function roomAsBuilt(room: RoomLayout, equipment: readonly EquipmentView[]): RoomLayout {
  const tiles = builtTiles.get(room);
  const built = tiles && [...tiles].filter(([type]) => equipment.some((e) => e.type === type));
  if (!built?.length) return room;
  const drawn = { ...room, tiles: [...room.tiles, ...built.map(([, tile]) => tile)] };
  builtTiles.set(drawn, new Map(built));
  return drawn;
}

/** Sprite key ("t<tile index>") -> the equipment it draws. */
export function equipmentByTileKey(roomLayout: RoomLayout | undefined, equipment: readonly EquipmentView[]): Map<string, EquipmentView> {
  const names = new Map(equipment.map((e) => [e.id, e]));
  const placed = (roomLayout ? placedEquipment(roomLayout) : []).flatMap((p) => {
    const e = names.get(p.id);
    return e ? [[`t${p.tile}` as string, e] as const] : [];
  });
  // An installed camera isn't bound in the map data (it isn't there until installed): it is the room's camera tile.
  // A built piece (a sofa, the MycoScan) is the tile `roomAsBuilt` added, standing for the room's first of its type.
  const extra: (readonly [string, EquipmentView])[] = [];
  const cameraTile = roomLayout?.tiles.findIndex((t) => CAMERA_SLICES.has(t.slice)) ?? -1;
  const camera = equipment.find((e) => e.type === CAMERA_EQUIPMENT);
  if (cameraTile >= 0 && camera) extra.push([`t${cameraTile}`, camera]);
  for (const [type, tile] of (roomLayout && builtTiles.get(roomLayout)) ?? []) {
    const index = roomLayout!.tiles.indexOf(tile);
    const built = equipment.find((e) => e.type === type);
    if (index >= 0 && built) extra.push([`t${index}`, built]);
  }
  return new Map([...placed, ...extra]);
}
