import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { RoomLayout, ShipLayout, SliceInfo, TilePlacement } from "@mush2/shared";
import { checkShip, unplacedLayout } from "../../src/shipLayout/check.ts";
import { alignDoors, placeRooms, seedPositions } from "../../src/shipLayout/roomPositions.ts";

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
/** A with a path (frame 1) along rows 2..3 to its front door. */
const withPath = { ...a, tiles: a.tiles.map((t) => (t.kind === "ground" && (t.y === 2 || t.y === 3) ? { ...t, frame: 1 } : t)) };

describe("seedPositions", () => {
  it("lines up each room's door back with the door it was reached through", () => {
    expect(seedPositions([a, b], "A")).toEqual({ A: { x: 0, y: 0 }, B: { x: 4, y: 0 } });
  });
});

describe("checkShip", () => {
  const ship = (bAt: { x: number; y: number }) => checkShip({ slices, rooms: [{ ...a, at: { x: 0, y: 0 } }, { ...b, at: bAt }] });

  it("finds nothing wrong with rooms that meet door to door", () => {
    expect(ship({ x: 4, y: 0 })).toEqual({ unplaced: [], overlaps: [], doors: [], offPath: [], gaps: [] });
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

  it("finds a door moved off the path drawn to it, against the original rooms", () => {
    const moved = { ...withPath, at: { x: 0, y: 0 }, tiles: withPath.tiles.map((t) => (t.door ? { ...t, y: 4 } : t)) };
    const rooms = [moved, { ...b, at: { x: 4, y: 1 } }];
    expect(checkShip({ slices, rooms }, [withPath, b]).offPath).toEqual([{ room: "A", target: "B", from: [4, 3], to: [4, 4] }]);
    // Without the original nothing is known to have moved.
    expect(checkShip({ slices, rooms }).offPath).toEqual([]);
  });
});

describe("placeRooms", () => {
  it("fails on a room the ship doesn't have", () => {
    expect(() => placeRooms([a, b], slices, { C: { x: 0, y: 0 } })).toThrow(/unknown room/);
  });

  it("leaves rooms off the table unplaced", () => {
    expect(placeRooms([a, b], slices, { A: { x: 0, y: 0 } }).map((r) => r.at)).toEqual([{ x: 0, y: 0 }, undefined]);
  });
});

describe("alignDoors", () => {
  const doorOf = (room: RoomLayout) => room.tiles.find((t) => t.door)!;
  const at = (room: RoomLayout, x: number, y: number) => room.tiles.filter((t) => t.x === x && t.y === y).map((t) => t.slice);

  it("moves a front-edge door along its edge onto the neighbour's drawn door, keeping its index", () => {
    const out = placeRooms([a, b], slices, { A: { x: 0, y: 0 }, B: { x: 4, y: 1 } });
    expect(doorOf(out[0]!)).toMatchObject({ x: 4, y: 4 });
    expect(out[0]!.tiles.indexOf(doorOf(out[0]!))).toBe(a.tiles.findIndex((t) => t.door));
    expect(checkShip({ slices, rooms: out }).doors).toEqual([]);
  });

  it("leaves both doors when the neighbour is off the edge, or neither door can move", () => {
    const apart = placeRooms([a, b], slices, { A: { x: 0, y: 0 }, B: { x: 5, y: 1 } });
    expect([doorOf(apart[0]!), doorOf(apart[1]!)]).toMatchObject([{ x: 4, y: 3 }, { x: 0, y: 3 }]);
    // y=5 would put A's door's lower cell past its floor, and B's door would need a wall at (0,0), its corner.
    const stuck = placeRooms([a, b], slices, { A: { x: 0, y: 0 }, B: { x: 4, y: 2 } });
    expect([doorOf(stuck[0]!), doorOf(stuck[1]!)]).toMatchObject([{ x: 4, y: 3 }, { x: 0, y: 3 }]);
  });

  it("keeps a door on the path drawn to it, and slides the drawn door on the other side along its wall to meet it", () => {
    // B's doormat goes with its door; the wall where the door lands fills the doorway it leaves.
    const mat = { ...b, tiles: [...b.tiles, { ...tile(0, 3, "entity", "DOOR_L_FLOOR"), layer: 1 as const }] };
    const out = placeRooms([withPath, mat], slices, { A: { x: 0, y: 0 }, B: { x: 4, y: 1 } });
    expect(doorOf(out[0]!)).toMatchObject({ x: 4, y: 3 });
    expect(doorOf(out[1]!)).toMatchObject({ x: 0, y: 2 });
    expect([at(out[1]!, 0, 1), at(out[1]!, 0, 2), at(out[1]!, 0, 3)]).toEqual([[], ["DOOR_L", "DOOR_L_FLOOR"], ["wall"]]);
    expect(out[1]!.tiles.map((t) => t.slice)).toEqual(mat.tiles.map((t) => t.slice));
    expect(checkShip({ slices, rooms: out }, [withPath, mat])).toMatchObject({ offPath: [], doors: [] });
  });

  it("doesn't slide a drawn door onto a wall with something on it, or off its own path", () => {
    const camera = { ...b, tiles: [...b.tiles, { ...tile(0, 1, "entity", "camera"), layer: 3 as const }] };
    expect(doorOf(placeRooms([withPath, camera], slices, { A: { x: 0, y: 0 }, B: { x: 4, y: 1 } })[1]!)).toMatchObject({ x: 0, y: 3 });
    const pathB = { ...b, tiles: b.tiles.map((t) => (t.kind === "ground" && t.x === 1 && t.y >= 2 ? { ...t, frame: 1 } : t)) };
    const out = placeRooms([withPath, pathB], slices, { A: { x: 0, y: 0 }, B: { x: 4, y: 1 } });
    expect(doorOf(out[1]!)).toMatchObject({ x: 0, y: 3 });
    expect(checkShip({ slices, rooms: out }, [withPath, pathB]).doors).toEqual([{ rooms: ["A", "B"], off: { x: 0, y: 1 } }]);
  });

  it("never moves a door to an unplaced room", () => {
    expect(doorOf(alignDoors([{ ...a, at: { x: 0, y: 0 } }, b], slices)[0]!)).toMatchObject({ x: 4, y: 3 });
  });
});

describe("the ship plan in ship-layout.json", () => {
  const layout = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../Mush/derived/ship-layout.json"), "utf8")) as ShipLayout;
  const report = checkShip(layout, unplacedLayout(resolve(import.meta.dirname, "../../../Mush")).rooms);

  it("places every room with doors, draws no room on another, and keeps every door on its path", () => {
    expect(report.unplaced).toEqual([]);
    expect(report.overlaps).toEqual([]);
    expect(report.offPath).toEqual([]);
  });

  it("has only these doors whose sides don't meet (fix one, then take it off this list)", () => {
    expect(report.doors.map((d) => `${d.rooms.join(" -> ")} ${d.off.x},${d.off.y}`)).toEqual([
      "MOTOR_ROOM -> SPACESHIP_BAY_AA -2,0",
      "LASER_TURRET_A_1 -> SPACESHIP_BAY_A 0,1",
      "LASER_TURRET_A_1 -> STORAGE_FRONT -1,0",
      "LASER_TURRET_A_2 -> MOTOR_ROOM 2,0",
      "LASER_TURRET_B_1 -> SICK_BAY -1,0",
      "LASER_TURRET_B_1 -> SPACESHIP_BAY_B 0,-1",
      "ICARUS -> MOTOR_ROOM 1,0",
    ]);
  });
});
