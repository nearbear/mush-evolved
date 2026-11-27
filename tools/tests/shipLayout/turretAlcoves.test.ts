import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { placedEquipment } from "@mush2/shared/src/shipLayout.ts";
import { readShip } from "../../src/shipLayout/shipMap.ts";
import { decodePng } from "../../src/shipLayout/png.ts";

const ROOMS = ["LASER_TURRET_B_0", "LASER_TURRET_B_1", "LASER_TURRET_A_2"];

// The owner's turret art (Mush/derived/gfx/turrets.png), placed through ship-art-extra.json.
describe("turret alcoves", () => {
  const ship = readShip();

  it.each(ROOMS)("%s draws its turret from the alcove sheet and keeps it clickable", (id) => {
    const room = ship.rooms.find((r) => r.id === id)!;
    const turret = placedEquipment(room).find((p) => p.type === "TURRET_COMMAND")!;
    const tile = room.tiles[turret.tile]!;
    expect(tile.slice).toBe(`turret_alcove_${id.slice(-3).toLowerCase()}`);
    const slice = ship.slices[tile.slice]!;
    expect(slice.sheet).toBe("TurretAlcoves");

    // The crop lies on the sheet and has art on all four of its edges (a tight crop).
    const sheet = ship.sheets[slice.sheet]!;
    const png = decodePng(readFileSync(resolve(import.meta.dirname, "../../../Mush", sheet.image)));
    expect({ width: png.width, height: png.height }).toEqual({ width: sheet.width, height: sheet.height });
    const opaque = (x: number, y: number) => png.rgba[((slice.y + y) * png.width + slice.x + x) * 4 + 3]! > 0;
    const any = (n: number, f: (i: number) => boolean) => Array.from({ length: n }, (_, i) => i).some(f);
    expect(any(slice.width, (x) => opaque(x, 0)) && any(slice.width, (x) => opaque(x, slice.height - 1))).toBe(true);
    expect(any(slice.height, (y) => opaque(0, y)) && any(slice.height, (y) => opaque(slice.width - 1, y))).toBe(true);
  });

});
