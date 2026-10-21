import { describe, expect, it } from "vitest";
import type { RoomLayout, TilePlacement } from "@mush2/shared";
import { deckFloors, paintWalkways, type Walkway } from "../../src/shipLayout/walkways.ts";

const tile = (x: number, y: number, kind: TilePlacement["kind"], slice: string, frame = 0): TilePlacement => ({ x, y, kind, layer: 0, slice, frame });

// Floor x 0..3, y 0..1; a grate at (3,1).
const room: RoomLayout = {
  id: "R",
  label: "R",
  equipment: [],
  tiles: [...[0, 1].flatMap((y) => [0, 1, 2].map((x) => tile(x, y, "ground", "GROUND"))), tile(3, 0, "ground", "GROUND"), tile(3, 1, "ground", "GROUND", 6)],
};

describe("paintWalkways", () => {
  it("repaints plain floor in the range as walkway, keeping every tile's index", () => {
    const [out] = paintWalkways([room], [{ room: "R", along: "y", x: [1, 2], y: [0, 1] }]);
    expect(out!.tiles.map((t) => `${t.x},${t.y}:${t.frame}`)).toEqual(room.tiles.map((t) => `${t.x},${t.y}:${t.x === 1 || t.x === 2 ? 1 : t.frame}`));
  });

  it("refuses anything but plain floor, paths that aren't two cells wide, and rooms that don't exist", () => {
    expect(() => paintWalkways([room], [{ room: "R", along: "x", x: [3, 3], y: [0, 1] }])).toThrow(/\(3,1\) isn't plain floor/);
    expect(() => paintWalkways([room], [{ room: "R", along: "y", x: [3, 4], y: [0, 0] }])).toThrow(/\(4,0\) isn't plain floor/);
    expect(() => paintWalkways([room], [{ room: "R", along: "x", x: [0, 2], y: [0, 0] }])).toThrow(/two cells wide/);
    expect(() => paintWalkways([room], [{ room: "NOPE", along: "x", x: [0, 0], y: [0, 1] }])).toThrow(/unknown room/);
  });
});

describe("deckFloors", () => {
  // A 6x6 floor at (1,0) on the ship.
  const square: RoomLayout = { id: "R", label: "R", equipment: [], at: { x: 1, y: 0 }, tiles: [0, 1, 2, 3, 4, 5].flatMap((y) => [0, 1, 2, 3, 4, 5].map((x) => tile(x, y, "ground", "GROUND"))) };
  const deck = (walkways: Walkway[]) => {
    const [out] = deckFloors(paintWalkways([square], walkways), walkways, ["R"]);
    return [0, 1, 2, 3, 4, 5].map((y) => [0, 1, 2, 3, 4, 5].map((x) => out!.tiles.find((t) => t.x === x && t.y === y)!.frame.toString(20)).join(" "));
  };

  it("lays plates in a 2x2 pattern on the ship grid, and paths with branches where they meet", () => {
    // A path along x across rows 2-3, one down from the top meeting its -y side, one up from the bottom meeting its +y side.
    expect(deck([
      { room: "R", along: "x", x: [0, 5], y: [2, 3] },
      { room: "R", along: "y", x: [1, 2], y: [0, 1] },
      { room: "R", along: "y", x: [3, 4], y: [4, 5] },
    ])).toEqual([
      "2 b a 0 2 0",
      "3 b a 1 3 1",
      "9 f e 9 9 9",
      "8 8 8 c d 8",
      "2 0 2 b a 0",
      "3 1 3 b a 1",
    ]);
    // A path along y with one meeting its +x side.
    expect(deck([
      { room: "R", along: "y", x: [1, 2], y: [0, 5] },
      { room: "R", along: "x", x: [3, 5], y: [2, 3] },
    ]).map((row) => row.slice(0, 7))).toEqual(["2 b a 0", "3 b a 1", "2 b i 9", "3 b j 8", "2 b a 0", "3 b a 1"]);
  });

  it("refuses a branch off a path's -x side, which the deck art doesn't have", () => {
    expect(() => deck([
      { room: "R", along: "y", x: [3, 4], y: [0, 5] },
      { room: "R", along: "x", x: [0, 2], y: [2, 3] },
    ])).toThrow(/-x side/);
  });
});
