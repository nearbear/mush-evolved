import { describe, expect, it } from "vitest";
import type { RoomLayout, SliceInfo, TilePlacement } from "@mush2/shared";
import { KNOWN_MISALIGNED } from "../../../web/src/editor/checks.ts";
import { checkShip } from "../../src/shipLayout/check.ts";
import { readShip } from "../../src/shipLayout/shipMap.ts";

const slices = { DOOR_L: { footprint: [1, 2] }, DOOR_BR: { footprint: [1, 2] } } as unknown as Record<string, SliceInfo>;
const tile = (x: number, y: number, kind: TilePlacement["kind"], slice: string = kind, target?: string): TilePlacement => ({
  x,
  y,
  kind,
  layer: 0,
  slice,
  frame: 0,
  ...(target && { door: { target } }),
});

/**
 * A room with floor x 1..3, y 1..4, back walls on x=0 and y=0, an open front edge on x=4, and
 * optionally a drawn door in its x=0 wall and a front-edge door on x=4 (both two cells, toward -y).
 */
function room(id: string, doors: { back?: [number, string]; front?: [number, string] } = {}): RoomLayout {
  const tiles: TilePlacement[] = [];
  for (let x = 1; x <= 3; x++) for (let y = 1; y <= 4; y++) tiles.push(tile(x, y, "ground"));
  for (let x = 1; x <= 3; x++) tiles.push(tile(x, 0, "wall"));
  for (let y = 1; y <= 4; y++) if (!doors.back || (y !== doors.back[0] && y !== doors.back[0] - 1)) tiles.push(tile(0, y, "wall"));
  if (doors.back) tiles.push(tile(0, doors.back[0], "door", "DOOR_L", doors.back[1]));
  if (doors.front) tiles.push(tile(4, doors.front[0], "door", "DOOR_BR", doors.front[1]));
  return { id, label: id, equipment: [], tiles };
}

// A's front edge (x=4) meets B's back wall: B at x+4 puts B's wall on A's front edge.
const a = room("A", { front: [3, "B"] });
const b = room("B", { back: [3, "A"] });

describe("checkShip", () => {
  const ship = (bAt: { x: number; y: number }) => checkShip({ slices, rooms: [{ ...a, at: { x: 0, y: 0 } }, { ...b, at: bAt }] });

  it("finds nothing wrong with rooms that meet door to door", () => {
    expect(ship({ x: 4, y: 0 })).toEqual({ unplaced: [], overlaps: [], doors: [], gaps: [] });
  });

  it("finds a floor on another room's floor, and under its wall", () => {
    const r = ship({ x: 2, y: 0 });
    expect(r.overlaps.find((o) => o.kind === "floor")).toMatchObject({ rooms: ["A", "B"], cells: [[3, 1], [3, 2], [3, 3], [3, 4]] });
    expect(r.overlaps.find((o) => o.kind === "wall")?.rooms).toEqual(["A", "B"]);
  });

  it("lists doors whose two sides don't meet, and the gap between rooms set apart", () => {
    const r = ship({ x: 5, y: 1 });
    expect(r.doors).toEqual([{ rooms: ["A", "B"], off: { x: 1, y: 1 } }]);
    expect(r.gaps.map((g) => g.rooms)).toEqual([["A", "B"]]);
  });

  it("lists a room with a door to the plan but no place on it", () => {
    expect(checkShip({ slices, rooms: [{ ...a, at: { x: 0, y: 0 } }, b] }).unplaced).toEqual(["B"]);
  });

});

describe("the ship in ship-map.json", () => {
  const report = checkShip(readShip());

  it("places every room with doors, and draws no room on another", () => {
    expect(report.unplaced).toEqual([]);
    expect(report.overlaps).toEqual([]);
  });

  it("has only these doors whose sides don't meet (fix one, then take it off this list)", () => {
    // The list is KNOWN_MISALIGNED in web/src/editor/checks.ts.
    expect(report.doors.map((d) => `${d.rooms.join(" -> ")} ${d.off.x},${d.off.y}`)).toEqual(KNOWN_MISALIGNED);
  });
});
