import { describe, expect, it } from "vitest";
import type { RoomLayout, ShipLayout, SliceInfo } from "@mush2/shared";
import shipLayoutJson from "../../../Mush/derived/ship-layout.json?raw";
import {
  cameraOffset,
  cellAtPoint,
  gridToPx,
  hitTest,
  neighborRooms,
  placeRoom,
  placeScene,
  spreadActors,
  standSpot,
  walkableCells,
} from "../../src/iso/placement.ts";

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
    { x: -1, y: 0, kind: "wall", layer: 0, slice: "wall", frame: 0 },
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

  it("draws a chair, and someone standing, in front of the wide console they face", () => {
    // The astro terminal is 4 cells wide (x 9..12, y 21); its anchor's x + y equals the chair's.
    const command = ship.rooms.find((r) => r.id === "COMMAND_CENTER")!;
    const placed = placeRoom(ship, command, [{ id: "p", cell: { x: 10, y: 22 }, width: 32, height: 48 }]);
    const order = (slice: string) => placed.find((s) => s.slice === slice)!.order;
    expect(order("chair_2")).toBeGreaterThan(order("pilot_astro_right"));
    expect(placed.find((s) => s.kind === "actor")!.order).toBeGreaterThan(order("pilot_astro_right"));
  });

  it("draws a neighbour's wall over the part of this room behind it, and this room's wall over the part of the neighbour behind it", () => {
    // The front corridor wraps around hydroponics: its left arm is behind the garden, its lower arm in front.
    const corridor = ship.rooms.find((r) => r.id === "CORRIDOR_A")!;
    const garden = neighborRooms(ship, corridor).find((n) => n.room.id === "HYDROPONIC_CENTER")!;
    const scene = placeScene(ship, [{ room: corridor, dx: 0, dy: 0, actors: [] }, { ...garden, actors: [] }]);
    const at = (room: string, kind: string, x: number, y: number) =>
      scene.find((s) => s.room === room && s.kind === kind && s.cell.x === x && s.cell.y === y)!.order;
    expect(at("HYDROPONIC_CENTER", "wall", 7, 8)).toBeGreaterThan(at("CORRIDOR_A", "ground", 6, 8));
    expect(at("CORRIDOR_A", "wall", 10, 14)).toBeGreaterThan(at("HYDROPONIC_CENTER", "ground", 10, 13));
  });

  it("hides people behind a neighbour's wall, and marks them for the see-through outline", () => {
    const corridor = ship.rooms.find((r) => r.id === "CORRIDOR_A")!;
    const garden = neighborRooms(ship, corridor).find((n) => n.room.id === "HYDROPONIC_CENTER")!;
    const scene = placeScene(ship, [
      { room: corridor, dx: 0, dy: 0, actors: [{ id: "hidden", cell: { x: 6, y: 8 }, width: 32, height: 48 }] },
      { ...garden, actors: [{ id: "open", cell: { x: 17, y: 18 }, width: 32, height: 48 }] },
    ]);
    const actor = (id: string) => scene.find((s) => s.key === `a:${id}`)!;
    const wall = scene.find((s) => s.room === "HYDROPONIC_CENTER" && s.kind === "wall" && s.cell.x === 7 && s.cell.y === 8)!;
    expect(wall.order).toBeGreaterThan(actor("hidden").order);
    expect(actor("hidden").occluded).toBe(true);
    expect(actor("open").occluded).toBe(false);
  });

  it("hides lockers behind the wall of the room in front", () => {
    // The command centre's locker stands on its front edge; the corridor's back wall is the next cell over.
    const command = ship.rooms.find((r) => r.id === "COMMAND_CENTER")!;
    const scene = placeScene(ship, [
      { room: command, dx: 0, dy: 0, actors: [] },
      ...neighborRooms(ship, command).map((n) => ({ ...n, actors: [] })),
    ]);
    const locker = scene.find((s) => s.room === "COMMAND_CENTER" && s.slice === "cupboard4")!;
    const wall = scene.find((s) => s.room === "CORRIDOR_A" && s.kind === "wall" && s.cell.x === locker.cell.x + 1 && s.cell.y === locker.cell.y)!;
    expect(wall.order).toBeGreaterThan(locker.order);
  });

  it("fills in the wall between two drawn rooms where neither has one", () => {
    // The turret room's south edge and the bridge's north edge are the same line, and neither draws it.
    const command = ship.rooms.find((r) => r.id === "COMMAND_CENTER")!;
    const scene = placeScene(ship, [
      { room: command, dx: 0, dy: 0, actors: [] },
      ...neighborRooms(ship, command).map((n) => ({ ...n, actors: [] })),
    ]);
    // x=17 is the second cell of the bridge's door to the turret (18,12).
    for (const x of [15, 16]) {
      const wall = scene.find((s) => s.kind === "wall" && s.cell.x === x && s.cell.y === 12);
      expect(wall?.room, `x=${x}`).toBe("COMMAND_CENTER");
    }
  });

  it("leaves out front-edge doors once the room behind them is drawn", () => {
    for (const r of ship.rooms) {
      const scene = placeScene(ship, [{ room: r, dx: 0, dy: 0, actors: [] }, ...neighborRooms(ship, r).map((n) => ({ ...n, actors: [] }))]);
      const drawn = new Set(scene.map((s) => s.room));
      expect(scene.filter((s) => (s.slice === "DOOR_BL" || s.slice === "DOOR_BR") && drawn.has(s.door!.target)), r.id).toEqual([]);
    }
  });

  it("floors both cells under a door alike, as part of the room whose back wall holds it", () => {
    // The sick bay's door to the front corridor (20,19 here) is in the sick bay's back wall, and a light path leads to it.
    const corridor = ship.rooms.find((r) => r.id === "CORRIDOR_A")!;
    const scene = placeScene(ship, [
      { room: corridor, dx: 0, dy: 0, actors: [] },
      ...neighborRooms(ship, corridor).map((n) => ({ ...n, actors: [] })),
    ]);
    const floor = (x: number) => scene.filter((s) => s.kind === "ground" && s.cell.x === x && s.cell.y === 19);
    const [a, b] = [floor(19), floor(20)];
    expect([a.length, b.length]).toEqual([1, 1]);
    expect(a[0]!.room).toBe("SICK_BAY");
    expect(b[0]!.room).toBe("SICK_BAY");
    expect([a[0]!.sx, a[0]!.sy]).toEqual([b[0]!.sx, b[0]!.sy]);
    const plain = scene.find((s) => s.kind === "ground" && s.cell.x === 19 && s.cell.y === 18)!;
    expect([a[0]!.sx, a[0]!.sy]).not.toEqual([plain.sx, plain.sy]);
  });

  it("leaves out the doormats", () => {
    for (const r of ship.rooms) expect(placeRoom(ship, r).filter((s) => s.slice.startsWith("DOOR_") && s.slice.endsWith("_FLOOR"))).toEqual([]);
  });

  it("draws no wall on a door's second cell", () => {
    for (const r of ship.rooms) {
      const placed = placeRoom(ship, r);
      for (const d of placed.filter((s) => s.kind === "door" && !s.slice.startsWith("DOOR_B"))) {
        const [w] = ship.slices[d.slice]!.footprint ?? [1, 1];
        const second = w > 1 ? { x: d.cell.x - 1, y: d.cell.y } : { x: d.cell.x, y: d.cell.y - 1 };
        expect(placed.filter((s) => s.kind === "wall" && s.cell.x === second.x && s.cell.y === second.y), `${r.id} ${d.slice}`).toEqual([]);
      }
    }
  });

  it("has somewhere to stand in every room people can reach", () => {
    for (const r of ship.rooms.filter((r) => r.tiles.some((t) => t.door))) {
      expect(walkableCells(ship, r).length, r.id).toBeGreaterThan(0);
    }
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

describe("cellAtPoint", () => {
  const cells = [{ x: 2, y: 3 }, { x: 3, y: 3 }];
  it("finds the walkable cell under a point and ignores points off the floor", () => {
    const a = gridToPx(3, 3);
    expect(cellAtPoint(cells, a.x, a.y + 6)).toEqual({ x: 3, y: 3 });
    expect(cellAtPoint(cells, a.x + 200, a.y)).toBeUndefined();
  });
});

describe("standSpot", () => {
  // A 3-wide console anchored at (4, 2): footprint x 2..4, y 2.
  const consoleLayout: ShipLayout = { ...layout, slices: { ...layout.slices, console: slice({ footprint: [3, 1] }) } };
  const consoleRoom: RoomLayout = { id: "C", label: "C", equipment: [], tiles: [{ x: 4, y: 2, kind: "entity", layer: 0, slice: "console", frame: 0 }] };
  const floor = (pred: (x: number, y: number) => boolean) => {
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < 6; y++) for (let x = 0; x < 7; x++) if (pred(x, y)) cells.push({ x, y });
    return cells;
  };
  const notConsole = (x: number, y: number) => !(y === 2 && x >= 2 && x <= 4);

  it("stands at the middle of the wide, camera-facing edge", () => {
    expect(standSpot(consoleLayout, consoleRoom, 0, floor(notConsole))).toEqual({ x: 3, y: 3 });
  });
  it("slides along the edge, then to the far side, when the middle is blocked", () => {
    expect(standSpot(consoleLayout, consoleRoom, 0, floor((x, y) => notConsole(x, y) && !(x === 3 && y === 3)))).toEqual({ x: 2, y: 3 });
    expect(standSpot(consoleLayout, consoleRoom, 0, floor((x, y) => notConsole(x, y) && y !== 3))).toEqual({ x: 3, y: 1 });
  });
  it("falls back to the nearest floor when nothing touches it", () => {
    expect(standSpot(consoleLayout, consoleRoom, 0, [{ x: 0, y: 5 }, { x: 6, y: 5 }])).toBeDefined();
  });
});

describe("neighborRooms", () => {
  const ship = JSON.parse(shipLayoutJson) as ShipLayout;
  const room = (id: string) => ship.rooms.find((r) => r.id === id)!;

  it("puts each neighbour's door back on the same cell as this room's door to it", () => {
    for (const r of ship.rooms) {
      for (const n of neighborRooms(ship, r)) {
        const here = r.tiles.find((t) => t.door?.target === n.room.id)!;
        const back = n.room.tiles.find((t) => t.door?.target === r.id)!;
        expect({ x: back.x + n.dx, y: back.y + n.dy }).toEqual({ x: here.x, y: here.y });
      }
    }
  });

  it("never puts a neighbour's floor on this room's floor", () => {
    for (const r of ship.rooms) {
      const floor = new Set(walkableCells(ship, r).map((c) => `${c.x},${c.y}`));
      for (const n of neighborRooms(ship, r)) {
        const overlap = walkableCells(ship, n.room).filter((c) => floor.has(`${c.x + n.dx},${c.y + n.dy}`));
        expect(overlap, `${r.id} / ${n.room.id}`).toEqual([]);
      }
    }
  });

  it("never puts two neighbours' floors on each other (the back corridor is stretched for this)", () => {
    for (const r of ship.rooms) {
      const ns = neighborRooms(ship, r);
      for (const [i, a] of ns.entries()) {
        const floor = new Set(walkableCells(ship, a.room).map((c) => `${c.x + a.dx},${c.y + a.dy}`));
        for (const b of ns.slice(i + 1)) {
          const overlap = walkableCells(ship, b.room).filter((c) => floor.has(`${c.x + b.dx},${c.y + b.dy}`));
          expect(overlap, `${r.id}: ${a.room.id} / ${b.room.id}`).toEqual([]);
        }
      }
    }
  });

  it("has corridors four cells wide", () => {
    // Across each corridor arm: walkable cells in one row (west arms, B, C) or column (the front corridor's north arm).
    const across = (id: string, axis: "x" | "y", at: number) =>
      walkableCells(ship, room(id)).filter((c) => (axis === "y" ? c.y : c.x) === at).length;
    expect(across("CORRIDOR_B", "y", 10)).toBe(4);
    expect(across("CORRIDOR_C", "y", 10)).toBe(4);
    expect(across("CORRIDOR_A", "y", 8)).toBe(4);
    expect(across("CORRIDOR_A", "x", 12)).toBe(4);
  });

  it("lists every room behind a door once", () => {
    expect(neighborRooms(ship, room("CORRIDOR_B")).map((n) => n.room.id).sort()).toEqual(
      ["CORRIDOR_A", "REFECTORY", "SPACESHIP_BAY_A", "SPACESHIP_BAY_B"],
    );
  });
});

describe("cameraOffset", () => {
  it("centres a room smaller than the panel", () => {
    expect(cameraOffset(400, 200, 0)).toBe(100);
  });
  it("follows the focus in a room bigger than the panel", () => {
    expect(cameraOffset(200, 1000, 500)).toBe(-400);
  });
  it("stops at the room's edges", () => {
    expect(cameraOffset(200, 1000, 10)).toBe(0);
    expect(cameraOffset(200, 1000, 990)).toBe(-800);
  });
});
