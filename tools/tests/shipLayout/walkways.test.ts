import { describe, expect, it } from "vitest";
import type { RoomLayout, TilePlacement } from "@mush2/shared";
import { paintWalkways } from "../../src/shipLayout/walkways.ts";

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
    const [out] = paintWalkways([room], [{ room: "R", x: [1, 2], y: [0, 1] }]);
    expect(out!.tiles.map((t) => `${t.x},${t.y}:${t.frame}`)).toEqual(room.tiles.map((t) => `${t.x},${t.y}:${t.x === 1 || t.x === 2 ? 1 : t.frame}`));
  });

  it("refuses anything but plain floor, and rooms that don't exist", () => {
    expect(() => paintWalkways([room], [{ room: "R", x: [3, 3], y: [0, 1] }])).toThrow(/\(3,1\) isn't plain floor/);
    expect(() => paintWalkways([room], [{ room: "R", x: [0, 4], y: [0, 0] }])).toThrow(/\(4,0\) isn't plain floor/);
    expect(() => paintWalkways([room], [{ room: "NOPE", x: [0, 0], y: [0, 0] }])).toThrow(/unknown room/);
  });
});
