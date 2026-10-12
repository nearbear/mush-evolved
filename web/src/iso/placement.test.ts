import { describe, expect, it } from "vitest";
import type { RoomLayout, ShipLayout, SliceInfo } from "@mush2/shared";
import shipLayoutJson from "../../../Mush/derived/ship-layout.json?raw";
import { fitScale, gridToPx, hitTest, placeRoom, spreadActors, walkableCells } from "./placement.ts";

const slice = (over: Partial<SliceInfo>): SliceInfo => ({
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
  ...over,
});

const layout: ShipLayout = {
  roomSize: 32,
  sheets: { S: { image: "s.png", width: 1000, height: 1000 } },
  slices: {
    floor: slice({ flags: ["pathable"], framesX: 2, offset: [0, 8] }),
    raised: slice({ flags: ["pathable"], frames: [{ groundOffsetY: 4 }] }),
    wall: slice({ width: 48, height: 66 }),
    door: slice({ flags: ["door"], footprint: [1, 2] }),
    table: slice({ footprint: [2, 1] }),
    camera: slice({ footprint: [1, 1], engine: "post" }),
  },
  rooms: [],
  autoBind: [],
};

const room: RoomLayout = {
  id: "TEST",
  label: "Test",
  equipment: [],
  tiles: [
    { x: 0, y: 0, kind: "ground", layer: 0, slice: "floor", frame: 1 },
    { x: 1, y: 0, kind: "ground", layer: 0, slice: "floor", frame: 0 },
    { x: 2, y: 0, kind: "ground", layer: 0, slice: "floor", frame: 0 },
    { x: 0, y: 1, kind: "ground", layer: 0, slice: "raised", frame: 0 },
    { x: 3, y: 3, kind: "wall", layer: 0, slice: "wall", frame: 0 },
    { x: 0, y: 2, kind: "door", layer: 0, slice: "door", frame: 0, door: { target: "ELSEWHERE" } },
    { x: 2, y: 0, kind: "entity", layer: 2, slice: "table", frame: 0 },
    { x: 3, y: 3, kind: "entity", layer: 3, slice: "camera", frame: 0 },
  ],
};

describe("gridToPx", () => {
  it("projects cells onto a 2:1 diamond grid", () => {
    expect(gridToPx(0, 0)).toEqual({ x: 0, y: 0 });
    expect(gridToPx(1, 0)).toEqual({ x: 16, y: 8 });
    expect(gridToPx(0, 1)).toEqual({ x: -16, y: 8 });
  });
});

describe("placeRoom", () => {
  const placed = placeRoom(layout, room, [{ id: "p0", cell: { x: 0, y: 1 }, width: 32, height: 48 }]);
  const find = (slice: string, x: number, y: number) => placed.find((s) => s.slice === slice && s.cell.x === x && s.cell.y === y)!;

  it("centers each sprite on its cell anchor plus the slice offset", () => {
    expect(find("floor", 1, 0)).toMatchObject({ left: 16 - 16, top: 8 + 8 - 10, width: 32, height: 20 });
  });

  it("picks the frame from the sheet grid", () => {
    expect(find("floor", 0, 0)).toMatchObject({ sx: 32, sy: 0 });
  });

  it("draws all tiles, then entities and people by depth, then post effects", () => {
    const order = (s: { order: number }) => s.order;
    const tiles = placed.filter((s) => ["ground", "wall", "door"].includes(s.kind));
    const table = find("table", 2, 0);
    const actor = placed.find((s) => s.kind === "actor")!;
    const camera = find("camera", 3, 3);
    expect(Math.max(...tiles.map(order))).toBeLessThan(Math.min(order(table), order(actor)));
    // The actor (depth 1) is behind the table (depth 2); the camera is drawn last.
    expect(order(actor)).toBeLessThan(order(table));
    expect(order(camera)).toBe(placed.length - 1);
  });

  it("keeps door targets and lifts people standing on raised floor", () => {
    expect(find("door", 0, 2).door).toEqual({ target: "ELSEWHERE" });
    const actor = placed.find((s) => s.kind === "actor")!;
    expect(actor.top).toBe(gridToPx(0, 1).y - 12 - 24 - 4);
  });
});

describe("walkableCells / spreadActors", () => {
  it("excludes floor under entity and door footprints", () => {
    // The table at (2,0) covers (2,0) and (1,0); the door at (0,2) covers (0,1).
    expect(walkableCells(layout, room)).toEqual([{ x: 0, y: 0 }]);
  });

  it("is deterministic and returns one spot per actor", () => {
    const cells = [0, 1, 2, 3].map((x) => ({ x, y: 0 }));
    expect(spreadActors(cells, 3)).toEqual(spreadActors(cells, 3));
    expect(spreadActors(cells, 3)).toHaveLength(3);
    expect(spreadActors([], 2)).toEqual([]);
  });

  it("keeps people at least a cell apart while there is room", () => {
    const cells = [];
    for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) cells.push({ x, y });
    const spots = spreadActors(cells, 6);
    for (const [i, a] of spots.entries()) {
      for (const b of spots.slice(i + 1)) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThan(1);
    }
  });
});

describe("the real ship", () => {
  const ship = JSON.parse(shipLayoutJson) as ShipLayout;

  it("places every door of every room with its target", () => {
    for (const r of ship.rooms) {
      const doors = placeRoom(ship, r).filter((s) => s.door);
      expect(doors).toHaveLength(r.tiles.filter((t) => t.door).length);
    }
  });

  it("has somewhere to stand in every room people can reach", () => {
    for (const r of ship.rooms.filter((r) => r.tiles.some((t) => t.door))) {
      expect(walkableCells(ship, r).length, r.id).toBeGreaterThan(0);
    }
  });
});

describe("fitScale", () => {
  const room = { width: 350, height: 220 };

  it("uses whole-number scales up to 3 when the room fits", () => {
    expect(fitScale(room, 880, 520)).toBe(2);
    expect(fitScale(room, 5000, 5000)).toBe(3);
    expect(fitScale(room, 400, 300)).toBe(1);
  });

  it("shrinks fractionally when the room doesn't fit", () => {
    expect(fitScale(room, 175, 520)).toBe(0.5);
  });

  it("never goes below the minimum (mobile scrolls instead)", () => {
    expect(fitScale({ width: 735, height: 465 }, 343, 400, { minScale: 1 })).toBe(1);
  });

  it("returns null when there is nothing to measure (hidden panel)", () => {
    expect(fitScale(room, 0, 0)).toBeNull();
    expect(fitScale(room, 343, 0, { minScale: 1 })).toBeNull();
  });
});

describe("hitTest", () => {
  // Two 10x10 sprites in paint order; the front one is only opaque in its left half.
  const back = { key: "back", left: 0, top: 0, width: 10, height: 10, flipX: false, flipY: false };
  const front = { key: "front", left: 5, top: 0, width: 10, height: 10, flipX: false, flipY: false };
  const leftHalf = (s: { key: string }, px: number) => s.key === "back" || px < 5;

  it("picks the frontmost sprite that is opaque under the point", () => {
    expect(hitTest([back, front], 7, 5, leftHalf)?.key).toBe("front");
  });

  it("falls through transparent pixels to what is behind", () => {
    expect(hitTest([back, front], 3, 5, leftHalf)?.key).toBe("back");
    // In front's box, but its right half is transparent and back doesn't reach that far.
    expect(hitTest([back, front], 12, 5, leftHalf)).toBeUndefined();
  });

  it("reads flipped sprites mirrored", () => {
    const flipped = { ...front, flipX: true };
    // Drawn mirrored, so the opaque half is now on screen right.
    expect(hitTest([flipped], 12, 5, leftHalf)?.key).toBe("front");
    expect(hitTest([flipped], 7, 5, leftHalf)).toBeUndefined();
  });
});
