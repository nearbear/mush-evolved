import { describe, expect, it } from "vitest";
import type { RoomLayout, ShipLayout, SliceInfo, TilePlacement } from "@mush2/shared";
import { problems } from "../../src/editor/checks.ts";

const tile = (x: number, y: number, kind: TilePlacement["kind"], slice: string = kind, target?: string): TilePlacement => ({
  x,
  y,
  kind,
  layer: 0,
  slice,
  frame: 0,
  ...(target !== undefined && { door: { target } }),
});
/** Floor x 1..3, y 1..3 and whatever else is given. */
const room = (id: string, at: { x: number; y: number }, extra: TilePlacement[] = [], equipment: RoomLayout["equipment"] = []): RoomLayout => {
  const tiles: TilePlacement[] = [];
  for (let x = 1; x <= 3; x++) for (let y = 1; y <= 3; y++) tiles.push(tile(x, y, "ground"));
  return { id, label: id, at, equipment, tiles: [...tiles, ...extra] };
};
const slice = (footprint?: [number, number]): SliceInfo => ({
  sheet: "S",
  x: 0,
  y: 0,
  width: 32,
  height: 20,
  framesX: 1,
  framesY: 1,
  flipX: false,
  flipY: false,
  rot: 0,
  offset: [0, 0],
  flags: [],
  frames: [],
  anims: [],
  ...(footprint && { footprint }),
});
const ship = (rooms: RoomLayout[]): ShipLayout => ({ slices: { ground: slice(), DOOR: slice([1, 1]), DOOR_BR: slice([1, 1]), bed: slice() }, sheets: {}, autoBind: [], rooms });
const titles = (rooms: RoomLayout[]) => problems(ship(rooms)).map((p) => `${p.severity} ${p.title}`);

describe("problems", () => {
  it("finds nothing in two rooms that meet door to door", () => {
    // As on the ship: A's door is on its open front edge (x=4), and B's is drawn in B's back wall, on B's floor.
    const a = room("A", { x: 0, y: 0 }, [tile(4, 2, "door", "DOOR_BR", "B")]);
    const b = room("B", { x: 4, y: 0 }, [tile(0, 1, "ground"), tile(0, 2, "ground"), tile(0, 3, "ground"), tile(0, 2, "door", "DOOR", "A")]);
    expect(titles([a, b])).toEqual([]);
  });

  it("finds a door with no room, one with no door back, and one with no floor", () => {
    const t = titles([
      room("A", { x: 0, y: 0 }, [tile(2, 2, "door", "DOOR", ""), tile(3, 3, "door", "DOOR", "B"), tile(9, 9, "door", "DOOR", "B")]),
      room("B", { x: 10, y: 0 }),
    ]);
    expect(t).toContain("error A door goes nowhere");
    expect(t).toContain("error A door to B has no door back");
    expect(t).toContain("error A door to B has no floor under it");
  });

  it("finds floor on floor, and equipment with no tile to draw it, errors first", () => {
    const t = titles([room("A", { x: 0, y: 0 }, [], [{ id: "BED", tile: "bed" }]), room("B", { x: 2, y: 0 })]);
    expect(t[0]).toBe("error A floor on B's");
    expect(t).toContain("warning A BED has no bed tile");
  });

  it("points at the tile and cells to fix", () => {
    const [p] = problems(ship([room("A", { x: 5, y: 5 }, [tile(2, 2, "door", "DOOR", "")])]));
    expect(p).toMatchObject({ room: "A", tile: { room: "A", index: 9 }, cells: [[7, 7]] });
  });
});
