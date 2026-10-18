// Which room tile draws which piece of equipment. Shared by the room (clicks) and the Inspect panel (the sprite).

import { CAMERA_EQUIPMENT, placedEquipment, type EquipmentView, type RoomLayout } from "@mush2/shared";

/** Tile slices of the camera art, one tile per room in the layout. */
export const CAMERA_SLICES: ReadonlySet<string> = new Set(["camera", "camera2"]);

/** Sprite key ("t<tile index>") -> the equipment it draws. */
export function equipmentByTileKey(roomLayout: RoomLayout | undefined, equipment: readonly EquipmentView[]): Map<string, EquipmentView> {
  const names = new Map(equipment.map((e) => [e.id, e]));
  const placed = (roomLayout ? placedEquipment(roomLayout) : []).flatMap((p) => {
    const e = names.get(p.id);
    return e ? [[`t${p.tile}` as string, e] as const] : [];
  });
  // An installed camera isn't bound in the map data (it isn't there until installed): it is the room's camera tile.
  const cameraTile = roomLayout?.tiles.findIndex((t) => CAMERA_SLICES.has(t.slice)) ?? -1;
  const camera = equipment.find((e) => e.type === CAMERA_EQUIPMENT);
  return new Map(cameraTile >= 0 && camera ? [...placed, [`t${cameraTile}`, camera] as const] : placed);
}
