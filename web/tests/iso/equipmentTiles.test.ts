import { describe, expect, it } from "vitest";
import type { EquipmentView, ShipLayout } from "@mush2/shared";
import shipLayoutJson from "../../../Mush/derived/ship-layout.json?raw";
import rooms from "../../../Mush/derived/ship-rooms.json";
import { SOFA_SPOTS, equipmentByTileKey, roomAsBuilt, withoutBuiltOnly } from "../../src/iso/equipmentTiles.ts";
import { walkableCells } from "../../src/iso/placement.ts";

const raw = JSON.parse(shipLayoutJson) as ShipLayout;
const layout = withoutBuiltOnly(raw);
const sofa: EquipmentView = { id: "X:SOFA:1", type: "SOFA" };
const roomOf = (l: ShipLayout, id: string) => l.rooms.find((r) => r.id === id)!;
const sofaTiles = (l: ShipLayout, id: string) => roomOf(l, id).tiles.filter((t) => t.slice === "sofa" || t.slice === "sofaReverse");

describe("built sofas", () => {
  it("are not drawn from the map: the turret room's sofa is gone until built", () => {
    expect(sofaTiles(raw, "LASER_TURRET_B_0")).toHaveLength(1);
    expect(layout.rooms.flatMap((r) => r.tiles).some((t) => t.slice === "sofa" || t.slice === "sofaReverse")).toBe(false);
    expect(sofaTiles(raw, "LASER_TURRET_B_0")[0]).toMatchObject(SOFA_SPOTS.LASER_TURRET_B_0!);
  });

  it("appear at the room's spot once built, appended, and stand for the first sofa", () => {
    const room = roomOf(layout, "COMMAND_CENTER");
    expect(roomAsBuilt(room, [])).toBe(room);
    const built = roomAsBuilt(room, [sofa, { id: "X:SOFA:2", type: "SOFA" }]);
    expect(built.tiles.slice(0, -1)).toEqual(room.tiles);
    expect(built.tiles.at(-1)).toMatchObject({ ...SOFA_SPOTS.COMMAND_CENTER, kind: "entity" });
    expect(equipmentByTileKey(built, [sofa]).get(`t${built.tiles.length - 1}`)).toEqual(sofa);
  });

  it("have a spot in every room but the Nexus and hydroponics, on free floor, leaving the floor connected", () => {
    const ids = rooms.map((r) => r.id);
    expect(ids.filter((id) => !SOFA_SPOTS[id]).sort()).toEqual(["HYDROPONIC_CENTER", "NEXUS_ROOM"]);
    for (const id of Object.keys(SOFA_SPOTS)) {
      const before = walkableCells(layout, roomOf(layout, id));
      const after = walkableCells(layout, roomAsBuilt(roomOf(layout, id), [sofa]));
      expect(before.length - after.length, id).toBe(3);
      const left = new Set(after.map((c) => `${c.x},${c.y}`));
      const seen = new Set([`${after[0]!.x},${after[0]!.y}`]);
      for (const queue = [...seen]; queue.length; ) {
        const [x, y] = queue.pop()!.split(",").map(Number) as [number, number];
        for (const k of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) if (left.has(k) && !seen.has(k)) (seen.add(k), queue.push(k));
      }
      expect(seen.size, id).toBe(left.size);
    }
  });
});
