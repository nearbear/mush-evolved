import { describe, expect, it } from "vitest";
import type { RoomLayout, ShipArt, ShipMap, TilePlacement } from "@mush2/shared";
import { gridToPx } from "../../src/iso/placement.ts";
import {
  ARROWS,
  deleteTile,
  duplicateTile,
  kindFor,
  moveRoom,
  moveTile,
  moveToRoom,
  nudgeSleeper,
  placeTile,
  rotateSofa,
  roomForCell,
  setDoorTarget,
  sleeperData,
  sleeperStep,
  stepFrame,
  tileAt,
} from "../../src/editor/edits.ts";

const tile = (x: number, y: number, slice = "GROUND", kind: TilePlacement["kind"] = "ground"): TilePlacement => ({ x, y, kind, layer: 0, slice, frame: 0 });
const room = (id: string, at: { x: number; y: number } | undefined, tiles: TilePlacement[]): RoomLayout => ({ id, label: id, tiles, equipment: [], ...(at && { at }) });
const map: ShipMap = {
  rooms: [
    room("A", { x: 0, y: 0 }, [tile(1, 1), tile(2, 1), tile(3, 1, "WALL", "wall")]),
    room("B", { x: 10, y: 5 }, [tile(0, 0)]),
    room("OFF", undefined, [tile(0, 0)]),
  ],
};
const art = { slices: { GROUND: { framesX: 4, framesY: 1, flags: ["pathable"] }, WALL: { framesX: 2, framesY: 1, flags: [] }, desk: { framesX: 1, framesY: 1, flags: [], footprint: [2, 1] }, DOOR: { framesX: 1, framesY: 1, flags: ["door"] } } } as unknown as ShipArt;

describe("edits", () => {
  it("change only the room they touch, and leave the old map as it was (undo keeps it)", () => {
    const next = moveTile(map, { room: "A", index: 1 }, 1, -1);
    expect(tileAt(next, { room: "A", index: 1 })).toMatchObject({ x: 3, y: 0 });
    expect(tileAt(map, { room: "A", index: 1 })).toMatchObject({ x: 2, y: 1 });
    expect(next.rooms[1]).toBe(map.rooms[1]);
  });

  it("move by the arrow keys in the directions they point on screen", () => {
    const screen = (k: string) => gridToPx(ARROWS[k]!.dx, ARROWS[k]!.dy);
    expect(screen("ArrowUp").y).toBeLessThan(0);
    expect(screen("ArrowDown").y).toBeGreaterThan(0);
    expect(screen("ArrowLeft").x).toBeLessThan(0);
    expect(screen("ArrowRight").x).toBeGreaterThan(0);
  });

  it("delete a tile, and duplicate one at the end of its room's tiles", () => {
    expect(deleteTile(map, { room: "A", index: 0 }).rooms[0]!.tiles.map((t) => t.x)).toEqual([2, 3]);
    const d = duplicateTile(map, { room: "A", index: 0 });
    expect(d.at).toEqual({ room: "A", index: 3 });
    expect(tileAt(d.map, d.at)).toEqual(tile(1, 1));
  });

  it("step through a slice's frames, wrapping both ways", () => {
    expect(tileAt(stepFrame(map, art, { room: "A", index: 2 }, 1), { room: "A", index: 2 })!.frame).toBe(1);
    expect(tileAt(stepFrame(map, art, { room: "A", index: 2 }, -1), { room: "A", index: 2 })!.frame).toBe(1);
    expect(tileAt(stepFrame(map, art, { room: "A", index: 0 }, -1), { room: "A", index: 0 })!.frame).toBe(3);
  });

  it("hand a tile to another room on the same ship cell, and not to or from a room off the plan", () => {
    const r = moveToRoom(map, { room: "A", index: 2 }, "B")!;
    expect(r.at).toEqual({ room: "B", index: 1 });
    expect(tileAt(r.map, r.at)).toMatchObject({ x: 3 - 10, y: 1 - 5, slice: "WALL" });
    expect(r.map.rooms[0]!.tiles).toHaveLength(2);
    expect(moveToRoom(map, { room: "A", index: 0 }, "OFF")).toBeUndefined();
    expect(moveToRoom(map, { room: "A", index: 0 }, "A")).toBeUndefined();
  });

  it("move a whole room on the plan, and leave a room off the plan off it", () => {
    const next = moveRoom(map, "B", 1, -2);
    expect(next.rooms[1]!.at).toEqual({ x: 11, y: 3 });
    expect(next.rooms[1]!.tiles).toBe(map.rooms[1]!.tiles);
    expect(moveRoom(map, "OFF", 1, 0).rooms[2]!.at).toBeUndefined();
  });

  it("place a tile on a ship cell in a room's own cells, and give a door its target", () => {
    const p = placeTile(map, "B", { x: 12, y: 7 }, { kind: "door", layer: 0, slice: "DOOR", frame: 0, door: { target: "" } });
    expect(tileAt(p.map, p.at)).toMatchObject({ x: 2, y: 2 });
    expect(tileAt(setDoorTarget(p.map, p.at, "A"), p.at)!.door).toEqual({ target: "A" });
  });
});

describe("kindFor", () => {
  it("takes what the map already uses for the slice", () => {
    expect(kindFor(map, art, "WALL")).toEqual({ kind: "wall", layer: 0 });
  });

  it("goes by the slice's flags for one the map doesn't use", () => {
    expect(kindFor({ rooms: [] }, art, "GROUND")).toEqual({ kind: "ground", layer: 0 });
    expect(kindFor({ rooms: [] }, art, "DOOR")).toEqual({ kind: "door", layer: 0 });
    expect(kindFor({ rooms: [] }, art, "desk")).toEqual({ kind: "entity", layer: 2 });
    expect(kindFor({ rooms: [] }, art, "WALL")).toEqual({ kind: "prop", layer: 1 });
  });
});

describe("roomForCell", () => {
  it("picks the room with floor there, then any tile there, then a tile next to it", () => {
    expect(roomForCell(map, { x: 1, y: 1 })).toBe("A");
    expect(roomForCell(map, { x: 3, y: 1 })).toBe("A");
    expect(roomForCell(map, { x: 11, y: 5 })).toBe("B");
    expect(roomForCell(map, { x: 40, y: 40 })).toBeUndefined();
  });

  it("rotate a sofa in place and keep its equipment binding on it", () => {
    const sofaMap: ShipMap = { rooms: [{ ...room("A", { x: 0, y: 0 }, [tile(1, 1), tile(4, 4, "sofa", "entity")]), equipment: [{ id: "SOFA", tile: "sofa" }] }] };
    const turned = rotateSofa(sofaMap, { room: "A", index: 1 });
    expect(tileAt(turned, { room: "A", index: 1 })).toMatchObject({ x: 4, y: 4, slice: "sofaReverse" });
    expect(turned.rooms[0]!.equipment).toEqual([{ id: "SOFA", tile: "sofaReverse" }]);
    expect(rotateSofa(turned, { room: "A", index: 1 })).toEqual(sofaMap);
    expect(rotateSofa(sofaMap, { room: "A", index: 0 })).toBe(sofaMap);
  });
});

describe("sleeper nudges", () => {
  const bedMap: ShipMap = {
    rooms: [
      { ...room("BEDS", { x: 0, y: 0 }, [tile(2, 2, "bed", "entity"), tile(4, 2, "bed", "entity"), tile(6, 2, "chair", "entity")]),
        equipment: [{ id: "BED", tile: "bed", key: "one", data: "flipped;ofsx_-12;ofsy_1" }, { id: "BED", tile: "bed", key: "two" }, { id: "CHAIR", tile: "chair", data: "ofsx_3" }] },
    ],
  };

  it("reads a bed's offsets, and nothing for a bed without data or something that isn't a bed", () => {
    expect(sleeperData(bedMap, { room: "BEDS", index: 0 })).toMatchObject({ data: "flipped;ofsx_-12;ofsy_1", x: -12, y: 1 });
    expect(sleeperData(bedMap, { room: "BEDS", index: 1 })).toBeUndefined();
    expect(sleeperData(bedMap, { room: "BEDS", index: 2 })).toBeUndefined();
  });

  it("changes only the offsets, keeping the rest of the data and every other binding", () => {
    const next = nudgeSleeper(bedMap, { room: "BEDS", index: 0 }, -2, 1);
    expect(next.rooms[0]!.equipment[0]!.data).toBe("flipped;ofsx_-14;ofsy_2");
    expect(next.rooms[0]!.equipment[1]).toBe(bedMap.rooms[0]!.equipment[1]);
    expect(nudgeSleeper(bedMap, { room: "BEDS", index: 1 }, 1, 1)).toBe(bedMap);
  });

  it("adds an offset the data doesn't have yet", () => {
    const m: ShipMap = { rooms: [{ ...bedMap.rooms[0]!, equipment: [{ id: "BED", tile: "bed", data: "flipped" }] }] };
    expect(nudgeSleeper(m, { room: "BEDS", index: 0 }, 2, 1).rooms[0]!.equipment[0]!.data).toBe("flipped;ofsx_2;ofsy_1");
  });

  it("steps half a cell along each arrow's grid axis, straight along gridToPx, or a pixel when fine", () => {
    for (const [key, a] of Object.entries(ARROWS)) {
      const cell = gridToPx(a.dx, a.dy);
      expect(sleeperStep(key, false)).toEqual({ x: cell.x / 8, y: cell.y / 8 });
    }
    expect(sleeperStep("ArrowUp", true)).toEqual({ x: 0, y: -1 });
    expect(sleeperStep("ArrowLeft", true)).toEqual({ x: -1, y: 0 });
    expect(sleeperStep("Enter", false)).toBeUndefined();
  });
});
