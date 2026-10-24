// Which room tile draws which piece of equipment. Shared by the room (clicks) and the Inspect panel (the sprite).

import { CAMERA_EQUIPMENT, EQUIPMENT_TYPES, placedEquipment, type EquipmentView, type RoomLayout, type ShipLayout, type TilePlacement } from "@mush2/shared";

/** Tile slices of the camera art, one tile per room in the layout. */
export const CAMERA_SLICES: ReadonlySet<string> = new Set(["camera", "camera2"]);

const SOFA_EQUIPMENT = "SOFA";

/** The built-only tile (a sofa) each room of the stripped layout had in the map, where `roomAsBuilt` draws it. */
const builtTiles = new WeakMap<RoomLayout, TilePlacement>();

/**
 * The layout without the map's built-only equipment (each room's sofa, placed in the ship map editor): it isn't
 * there until someone builds it, and then `roomAsBuilt` draws it where the map had it. Run once, when the layout
 * loads. A room with no sofa tile in the map (the Nexus, hydroponics: no wall with room for it) never draws one.
 */
export function withoutBuiltOnly(layout: ShipLayout): ShipLayout {
  const rooms = layout.rooms.map((room) => {
    const placed = placedEquipment(room).filter((p) => EQUIPMENT_TYPES[p.type]?.builtOnly);
    if (placed.length === 0) return room;
    const drop = new Set(placed.map((p) => p.tile));
    const stripped = { ...room, tiles: room.tiles.filter((_, i) => !drop.has(i)), equipment: room.equipment.filter((b) => !EQUIPMENT_TYPES[b.id]?.builtOnly) };
    const sofa = placed.find((p) => p.type === SOFA_EQUIPMENT);
    if (sofa) builtTiles.set(stripped, room.tiles[sofa.tile]!);
    return stripped;
  });
  return { ...layout, rooms };
}

/**
 * The room as drawn: with a sofa at the map's spot once one is built. Only one is drawn; a second sofa in the room
 * works but isn't drawn (the original listed it on the shelf). The tile goes last, so other tiles keep their indices.
 */
export function roomAsBuilt(room: RoomLayout, equipment: readonly EquipmentView[]): RoomLayout {
  const tile = builtTiles.get(room);
  if (!tile || !equipment.some((e) => e.type === SOFA_EQUIPMENT)) return room;
  const built = { ...room, tiles: [...room.tiles, tile] };
  builtTiles.set(built, tile);
  return built;
}

/** Sprite key ("t<tile index>") -> the equipment it draws. */
export function equipmentByTileKey(roomLayout: RoomLayout | undefined, equipment: readonly EquipmentView[]): Map<string, EquipmentView> {
  const names = new Map(equipment.map((e) => [e.id, e]));
  const placed = (roomLayout ? placedEquipment(roomLayout) : []).flatMap((p) => {
    const e = names.get(p.id);
    return e ? [[`t${p.tile}` as string, e] as const] : [];
  });
  // An installed camera isn't bound in the map data (it isn't there until installed): it is the room's camera tile.
  // A built sofa is the tile `roomAsBuilt` added, standing for the room's first sofa.
  const extra: (readonly [string, EquipmentView])[] = [];
  const cameraTile = roomLayout?.tiles.findIndex((t) => CAMERA_SLICES.has(t.slice)) ?? -1;
  const camera = equipment.find((e) => e.type === CAMERA_EQUIPMENT);
  if (cameraTile >= 0 && camera) extra.push([`t${cameraTile}`, camera]);
  const builtSofa = roomLayout && builtTiles.get(roomLayout);
  const sofaTile = roomLayout && builtSofa ? roomLayout.tiles.findIndex((t) => t === builtSofa) : -1;
  const sofa = equipment.find((e) => e.type === SOFA_EQUIPMENT);
  if (sofaTile >= 0 && sofa) extra.push([`t${sofaTile}`, sofa]);
  return new Map([...placed, ...extra]);
}
