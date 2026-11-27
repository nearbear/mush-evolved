// The cheat room's layout (#170): Mush/derived/cheat-room.json, added to the ship's only once you're in it.
import { describe, expect, it } from "vitest";
import { CHEAT_ROOM, placedEquipment, resolveConfig, type RoomLayout, type ShipLayout } from "@mush2/shared";
import { shipArt } from "./shipArt.ts";
import shipMapJson from "../../../Mush/derived/ship-map.json?raw";
import cheatRoomJson from "../../../Mush/derived/cheat-room.json";
import { neighborRooms, walkableCells } from "../../src/iso/placement.ts";
import { addCheatRoom, atlasUrl } from "../../src/iso/shipLayout.ts";

const ship = { ...shipArt(), ...JSON.parse(shipMapJson) } as ShipLayout;
const room = cheatRoomJson as RoomLayout;
const layout = addCheatRoom(ship, room);

describe("cheat room layout", () => {
  it("is not in the ship map, and is added once, as the same object", () => {
    expect(ship.rooms.some((r) => r.id === CHEAT_ROOM)).toBe(false);
    expect(room.id).toBe(CHEAT_ROOM);
    expect(addCheatRoom(ship, room)).toBe(layout);
  });

  it("draws the rules' equipment, the Superkube, with an image", () => {
    const placed = placedEquipment(room);
    expect(placed.map((p) => p.id)).toEqual(resolveConfig({ cheatRoom: true }).equipment[CHEAT_ROOM]!.map((e) => e.id));
    for (const p of placed) expect(atlasUrl(layout, layout.slices[room.tiles[p.tile]!.slice]!.sheet)).toBeTruthy();
  });

  it("has floor to walk on and no door: nothing is drawn beside it, and no room draws it", () => {
    expect(walkableCells(layout, room).length).toBeGreaterThan(20);
    expect(room.tiles.some((t) => t.door)).toBe(false);
    expect(neighborRooms(layout, room, "all")).toEqual([]);
    for (const r of layout.rooms) if (r !== room) expect(neighborRooms(layout, r, "all").some((n) => n.room.id === CHEAT_ROOM)).toBe(false);
  });
});
