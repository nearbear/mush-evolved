import { describe, expect, it } from "vitest";
import type { RoomLayout, TilePlacement } from "@mush2/shared";
import { moveTiles } from "../../src/shipLayout/moves.ts";

const tile = (x: number, y: number, kind: TilePlacement["kind"], slice: string): TilePlacement => ({ x, y, kind, layer: 0, slice, frame: 0 });

const room: RoomLayout = {
  id: "R",
  label: "R",
  equipment: [],
  tiles: [tile(0, 0, "ground", "GROUND"), tile(1, 0, "ground", "GROUND"), tile(1, 0, "entity", "dome")],
};

describe("moveTiles", () => {
  it("moves the named tile and keeps every tile's index", () => {
    const [out] = moveTiles([room], [{ room: "R", slice: "dome", from: [1, 0], to: [0, 0] }]);
    expect(out!.tiles.map((t) => [t.slice, t.x, t.y])).toEqual([
      ["GROUND", 0, 0],
      ["GROUND", 1, 0],
      ["dome", 0, 0],
    ]);
  });

  it("reads every move from where tiles were before any of them, so tiles can swap", () => {
    const [out] = moveTiles([room], [
      { room: "R", slice: "GROUND", from: [0, 0], to: [1, 0] },
      { room: "R", slice: "GROUND", from: [1, 0], to: [0, 0] },
    ]);
    expect(out!.tiles.slice(0, 2).map((t) => t.x)).toEqual([1, 0]);
  });

  it("fails on a move that matches no tile, or an unknown room", () => {
    expect(() => moveTiles([room], [{ room: "R", slice: "dome", from: [0, 0], to: [1, 0] }])).toThrow(/0 dome tiles at 0,0/);
    expect(() => moveTiles([room], [{ room: "Q", slice: "dome", from: [1, 0], to: [0, 0] }])).toThrow(/unknown room Q/);
  });
});
