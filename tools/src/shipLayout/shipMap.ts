// Reading and writing Mush/derived/ship-map.json, the hand-edited rooms (see ShipMap in shared).

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RoomLayout, ShipArt, ShipLayout, ShipMap } from "@mush2/shared";

export const DERIVED = resolve(import.meta.dirname, "../../../Mush/derived");

const read = (file: string) => JSON.parse(readFileSync(resolve(DERIVED, file), "utf8"));

export const readMap = (): ShipMap => read("ship-map.json");

export const readArt = (): ShipArt => read("ship-art.json");

/** The art and the map together, as the client loads them. */
export const readShip = (): ShipLayout => ({ ...readArt(), ...readMap() });

export const writeMap = (map: ShipMap) => writeFileSync(resolve(DERIVED, "ship-map.json"), formatShipMap(map));

/** ship-map.json as written: one tile per line, so diffs stay readable. */
export function formatShipMap(map: ShipMap): string {
  const line = (v: unknown) => JSON.stringify(v);
  const room = ({ id, label, at, equipment, tiles }: RoomLayout) =>
    [
      `    {`,
      `      "id": ${line(id)},`,
      `      "label": ${line(label)},`,
      ...(at ? [`      "at": ${line(at)},`] : []),
      `      "equipment": [${equipment.length ? `\n${equipment.map((e) => `        ${line(e)}`).join(",\n")}\n      ` : ""}],`,
      `      "tiles": [${tiles.length ? `\n${tiles.map((t) => `        ${line(t)}`).join(",\n")}\n      ` : ""}]`,
      `    }`,
    ].join("\n");
  return `{\n  "rooms": [\n${map.rooms.map(room).join(",\n")}\n  ]\n}\n`;
}

