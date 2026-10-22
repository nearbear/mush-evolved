// What a ship map must be before it is written (the editor's save, and a test on the committed file):
// well-formed rooms and tiles, only slices and frames the art has, doors with a room to go to, and
// equipment bound to slices that exist. Pure; returns problems as sentences, none when it's fine.

import type { ShipArt, ShipMap } from "@mush2/shared";

const KINDS = new Set(["ground", "wall", "door", "prop", "entity"]);
const isInt = (v: unknown): v is number => Number.isInteger(v);

export function validateMap(map: ShipMap, art: Pick<ShipArt, "slices">): string[] {
  const problems: string[] = [];
  if (!map || !Array.isArray(map.rooms)) return ["the map has no rooms list"];
  const ids = new Set<string>();
  for (const room of map.rooms) {
    const id = String(room?.id);
    if (typeof room?.id !== "string" || !room.id) problems.push("a room has no id");
    else if (ids.has(id)) problems.push(`${id}: two rooms with this id`);
    ids.add(id);
    if (typeof room?.label !== "string") problems.push(`${id}: no label`);
    if (room?.at !== undefined && !(isInt(room.at?.x) && isInt(room.at?.y))) problems.push(`${id}: its position isn't two whole numbers`);
    if (!Array.isArray(room?.tiles) || !Array.isArray(room?.equipment)) {
      problems.push(`${id}: tiles or equipment missing`);
      continue;
    }
    room.tiles.forEach((t, i) => {
      const where = `${id} #${i}`;
      if (!isInt(t?.x) || !isInt(t?.y)) problems.push(`${where}: its cell isn't two whole numbers`);
      if (!KINDS.has(t?.kind)) problems.push(`${where}: unknown kind ${t?.kind}`);
      if (![0, 1, 2, 3].includes(t?.layer)) problems.push(`${where}: layer must be 0 to 3`);
      const slice = art.slices[t?.slice];
      if (!slice) problems.push(`${where}: unknown slice ${t?.slice}`);
      else if (!isInt(t.frame) || t.frame < 0 || t.frame >= slice.framesX * slice.framesY) problems.push(`${where}: ${t.slice} has no frame ${t.frame}`);
      if (t?.kind === "door" && typeof t.door?.target !== "string") problems.push(`${where}: a door with no room to go to`);
      if (t?.kind !== "door" && t?.door !== undefined) problems.push(`${where}: a door target on a ${t?.kind}`);
    });
    for (const b of room.equipment) {
      for (const s of [b?.tile, b?.mask]) if (s !== undefined && !art.slices[s]) problems.push(`${id}: ${b?.id} is bound to unknown slice ${s}`);
    }
  }
  for (const room of map.rooms) {
    for (const [i, t] of (room?.tiles ?? []).entries()) {
      const target = t?.door?.target;
      if (typeof target === "string" && !ids.has(target)) problems.push(`${room.id} #${i}: a door to ${target || "nowhere"}, which isn't a room`);
    }
  }
  return problems;
}
