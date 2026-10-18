// Which room tile draws which piece of equipment. Shared by the room (clicks) and the Inspect panel (the sprite).

import { CAMERA_EQUIPMENT, EQUIPMENT_TYPES, placedEquipment, type EquipmentView, type RoomLayout, type ShipLayout, type TilePlacement } from "@mush2/shared";

/** Tile slices of the camera art, one tile per room in the layout. */
export const CAMERA_SLICES: ReadonlySet<string> = new Set(["camera", "camera2"]);

const SOFA_EQUIPMENT = "SOFA";

/**
 * Where a built sofa is drawn: hand-picked per room (owner, 2026-10-18; the bridge's is under the camera), each
 * against a wall, on free floor, leaving the rest of the floor connected. `sofa` runs along y with the wall at
 * x - 1, `sofaReverse` along x with the wall at y - 1; the anchor is the footprint's far corner. The turret room's
 * is where the map draws one. Rooms not listed (the Nexus, hydroponics: no wall with room for it) never draw one.
 */
export const SOFA_SPOTS: Readonly<Record<string, { x: number; y: number; slice: "sofa" | "sofaReverse" }>> = {
  COMMAND_CENTER: { x: 17, y: 13, slice: "sofaReverse" },
  SPACESHIP_BAY_A: { x: 6, y: 14, slice: "sofa" },
  SPACESHIP_BAY_B: { x: 26, y: 12, slice: "sofaReverse" },
  SPACESHIP_BAY_AA: { x: 6, y: 18, slice: "sofa" },
  SICK_BAY: { x: 16, y: 11, slice: "sofaReverse" },
  LABORATORY: { x: 20, y: 12, slice: "sofaReverse" },
  REFECTORY: { x: 11, y: 16, slice: "sofa" },
  MOTOR_ROOM: { x: 24, y: 4, slice: "sofaReverse" },
  LASER_TURRET_A_0: { x: 16, y: 16, slice: "sofaReverse" },
  LASER_TURRET_A_1: { x: 12, y: 18, slice: "sofa" },
  LASER_TURRET_A_2: { x: 15, y: 12, slice: "sofaReverse" },
  LASER_TURRET_B_0: { x: 12, y: 14, slice: "sofa" },
  LASER_TURRET_B_1: { x: 12, y: 16, slice: "sofa" },
  LASER_TURRET_B_2: { x: 16, y: 13, slice: "sofaReverse" },
  CORRIDOR_A: { x: 3, y: 20, slice: "sofa" },
  CORRIDOR_B: { x: 16, y: 22, slice: "sofa" },
  CORRIDOR_C: { x: 16, y: 21, slice: "sofa" },
  ICARUS: { x: 15, y: 11, slice: "sofaReverse" },
  BEDROOM_A: { x: 17, y: 13, slice: "sofaReverse" },
  BEDROOM_B: { x: 14, y: 13, slice: "sofaReverse" },
  STORAGE_FRONT: { x: 11, y: 20, slice: "sofa" },
  STORAGE_A_0: { x: 12, y: 15, slice: "sofa" },
  STORAGE_A_1: { x: 11, y: 18, slice: "sofa" },
  STORAGE_B_0: { x: 18, y: 13, slice: "sofaReverse" },
  STORAGE_B_1: { x: 12, y: 16, slice: "sofa" },
};

/**
 * The layout without the map's built-only equipment (the turret room's sofa): it isn't there until someone builds
 * it, and then `roomAsBuilt` draws it at the room's spot. Run once, when the layout loads.
 */
export function withoutBuiltOnly(layout: ShipLayout): ShipLayout {
  const rooms = layout.rooms.map((room) => {
    const drop = new Set(placedEquipment(room).filter((p) => EQUIPMENT_TYPES[p.type]?.builtOnly).map((p) => p.tile));
    if (drop.size === 0) return room;
    return { ...room, tiles: room.tiles.filter((_, i) => !drop.has(i)), equipment: room.equipment.filter((b) => !EQUIPMENT_TYPES[b.id]?.builtOnly) };
  });
  return { ...layout, rooms };
}

/**
 * The room as drawn: with a sofa at its spot once one is built. Only one is drawn; a second sofa in the room works
 * but isn't drawn (the original listed it on the shelf). The tile goes last, so other tiles keep their indices.
 */
export function roomAsBuilt(room: RoomLayout, equipment: readonly EquipmentView[]): RoomLayout {
  const spot = SOFA_SPOTS[room.id];
  if (!spot || !equipment.some((e) => e.type === SOFA_EQUIPMENT)) return room;
  const tile: TilePlacement = { x: spot.x, y: spot.y, kind: "entity", layer: 2, slice: spot.slice, frame: 0 };
  return { ...room, tiles: [...room.tiles, tile] };
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
  const sofaTile = roomLayout?.tiles.findIndex((t) => t.slice === SOFA_SPOTS[roomLayout.id]?.slice) ?? -1;
  const sofa = equipment.find((e) => e.type === SOFA_EQUIPMENT);
  if (sofaTile >= 0 && sofa) extra.push([`t${sofaTile}`, sofa]);
  return new Map([...placed, ...extra]);
}
