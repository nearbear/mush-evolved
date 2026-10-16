import { describe, expect, it } from "vitest";
import type { RoomLayout, SliceInfo, TilePlacement } from "@mush2/shared";
import { stretchRoom, stretchRooms } from "../../src/shipLayout/stretch.ts";

const slices = { door: { footprint: [2, 1] }, crate: { footprint: [2, 1] } } as unknown as Record<string, SliceInfo>;
const tile = (x: number, y: number, kind: TilePlacement["kind"], slice: string = kind, layer: TilePlacement["layer"] = 0): TilePlacement => ({
  x,
  y,
  kind,
  layer,
  slice,
  frame: 0,
});

// A wall row with a 2-wide door at its right end, over two rows of floor:
//   y0: W W D(fp x1..2)
//   y1: . . .
//   y2: . . .
const room: RoomLayout = {
  id: "R",
  label: "R",
  equipment: [],
  tiles: [
    tile(0, 0, "wall"),
    tile(1, 0, "wall"),
    tile(2, 0, "door", "door"),
    ...[1, 2].flatMap((y) => [0, 1, 2].map((x) => tile(x, y, "ground"))),
    tile(1, 1, "prop", "poster", 1),
  ],
};

describe("stretchRoom", () => {
  const out = stretchRoom(room, slices, { room: "R", axis: "x", after: 1, count: 2 });
  const at = (x: number, y: number) => out.tiles.filter((t) => t.x === x && t.y === y).map((t) => t.kind);

  it("copies the line's floor and walls and moves what's past it", () => {
    expect(at(2, 0)).toEqual(["wall"]);
    expect(at(3, 0)).toEqual(["wall"]);
    expect(at(4, 0)).toEqual(["door"]);
    for (const x of [0, 1, 2, 3, 4]) expect(at(x, 2)).toEqual(["ground"]);
  });

  it("leaves things standing on the line where they are, uncopied", () => {
    expect(at(1, 1)).toEqual(["ground", "prop"]);
    expect(at(2, 1)).toEqual(["ground"]);
  });

  it("keeps existing tiles at their indices", () => {
    expect(out.tiles.slice(0, room.tiles.length).map((t) => t.slice)).toEqual(room.tiles.map((t) => t.slice));
  });

  it("refuses to split something on the floor", () => {
    const crate = { ...room, tiles: [...room.tiles, tile(2, 2, "entity", "crate", 2)] };
    expect(() => stretchRoom(crate, slices, { room: "R", axis: "x", after: 1, count: 1 })).toThrow(/straddles/);
  });

  it("copies a door on the line as the wall beside it", () => {
    const door = stretchRoom(room, slices, { room: "R", axis: "x", after: 2, count: 2 });
    const at = (x: number) => door.tiles.filter((t) => t.x === x && t.y === 0).map((t) => t.kind);
    expect([at(2), at(3), at(4)]).toEqual([["door"], ["wall"], ["wall"]]);
    // A door with no wall beside it (a front-edge door) gets no copies.
    const open = { ...room, tiles: room.tiles.filter((t) => !(t.kind === "wall" && t.x === 1)) };
    expect(stretchRoom(open, slices, { room: "R", axis: "x", after: 2, count: 2 }).tiles.filter((t) => t.y === 0 && t.x > 2)).toEqual([]);
  });
});

describe("stretchRooms", () => {
  it("measures every stretch of a room in its original coordinates", () => {
    const [out] = stretchRooms([room], slices, [
      { room: "R", axis: "y", after: 1, count: 1 },
      { room: "R", axis: "y", after: 2, count: 1 },
    ]);
    // Rows 1 and 2 are each doubled: floor on rows 1..4.
    expect(new Set(out!.tiles.filter((t) => t.kind === "ground").map((t) => t.y))).toEqual(new Set([1, 2, 3, 4]));
  });

  it("fails on a room that doesn't exist", () => {
    expect(() => stretchRooms([room], slices, [{ room: "NOPE", axis: "x", after: 0, count: 1 }])).toThrow(/unknown room/);
  });
});
