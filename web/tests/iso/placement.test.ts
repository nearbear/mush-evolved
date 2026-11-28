import { describe, expect, it } from "vitest";
import { placedEquipment, type RoomLayout, type ShipLayout, type SliceInfo } from "@mush2/shared";
import { shipArt } from "./shipArt.ts";
import shipMapJson from "../../../Mush/derived/ship-map.json?raw";
import { withoutBuiltOnly } from "../../src/iso/equipmentTiles.ts";
import {
  cellAtPoint,
  doorPassage,
  doorSpot,
  lyingPose,
  gridToPx,
  hitTest,
  neighborRooms,
  placeActors,
  placeRoom,
  placeScene,
  placeWithSlots,
  prepareScene,
  spreadActors,
  standSpot,
  standSpots,
  offFloorStep,
  stepsOnto,
  terminalSpot,
  walkableCells,
  walkPath,
} from "../../src/iso/placement.ts";
import { facingFor } from "../../src/iso/useWalkers.ts";

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

describe("T junctions", () => {
  // Room A's main-axis wall (along x, on the y = 1 line) runs into room B's cross-axis wall (along y, on
  // the x = 2 line). Cell (1, 0) holds both; B's carries on past their corner (2, 1), A's stops there.
  const tees: ShipLayout = {
    ...layout,
    slices: { ...layout.slices, BIG_WALL_R: slice({ width: 48, height: 66 }), BIG_WALL_L: slice({ width: 48, height: 66 }), sign: slice({ width: 40 }) },
  };
  const wall = (slice: string, x: number, y: number) => ({ x, y, kind: "wall" as const, layer: 0, slice, frame: 0 });
  const a: RoomLayout = { id: "A", label: "A", tiles: [wall("BIG_WALL_R", 0, 0), wall("BIG_WALL_R", 1, 0)] };
  const b = (tiles: RoomLayout["tiles"]): RoomLayout => ({ id: "B", label: "B", tiles });
  const orderOf = (placed: ReturnType<typeof placeScene>, room: string, slice: string, x: number, y: number) =>
    placed.find((s) => s.room === room && s.slice === slice && s.cell.x === x && s.cell.y === y)!.order;

  it("draws the wall that stops under the wall it runs into, and what is mounted on that", () => {
    const sign = { x: 1, y: 1, kind: "prop" as const, layer: 0, slice: "sign", frame: 0 };
    for (const first of ["A", "B"]) {
      const rooms = [
        { room: a, dx: 0, dy: 0, actors: [] },
        { room: b([wall("BIG_WALL_L", 1, 0), wall("BIG_WALL_L", 1, 1), sign]), dx: 0, dy: 0, actors: [] },
      ];
      const placed = placeScene(tees, first === "A" ? rooms : rooms.reverse());
      const under = orderOf(placed, "A", "BIG_WALL_R", 1, 0);
      expect(under, `${first} first`).toBeLessThan(orderOf(placed, "B", "BIG_WALL_L", 1, 0));
      expect(under, `${first} first`).toBeLessThan(orderOf(placed, "B", "sign", 1, 1));
    }
  });

  it("works the other way round: a cross-axis wall stopping at a main-axis one goes under it", () => {
    const main: RoomLayout = { id: "A", label: "A", tiles: [wall("BIG_WALL_R", 0, 0), wall("BIG_WALL_R", 1, 0), wall("BIG_WALL_R", 2, 0)] };
    for (const first of ["A", "B"]) {
      const rooms = [
        { room: main, dx: 0, dy: 0, actors: [] },
        { room: b([wall("BIG_WALL_L", 1, -1), wall("BIG_WALL_L", 1, 0)]), dx: 0, dy: 0, actors: [] },
      ];
      const placed = placeScene(tees, first === "A" ? rooms : rooms.reverse());
      expect(orderOf(placed, "B", "BIG_WALL_L", 1, 0), `${first} first`).toBeLessThan(orderOf(placed, "A", "BIG_WALL_R", 1, 0));
    }
  });
});

describe("placeWithSlots", () => {
  // A 4x4 floor with a two-cell table across (1,1)-(2,1).
  const floor: RoomLayout = {
    id: "BURNING",
    label: "Burning",
    equipment: [],
    tiles: [
      ...[0, 1, 2, 3].flatMap((x) => [0, 1, 2, 3].map((y) => ({ x, y, kind: "ground" as const, layer: 0, slice: "floor", frame: 0 }))),
      { x: 2, y: 1, kind: "entity", layer: 2, slice: "table", frame: 0 },
    ],
  };
  const prepared = prepareScene(layout, [{ room: floor, dx: 0, dy: 0 }]);
  const person = [{ id: "p", cell: { x: 3, y: 3 }, width: 32, height: 48 }];
  const cells = [{ x: 1, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 3 }];
  const { sprites, slots } = placeWithSlots(prepared, [person], cells);
  const slot = (x: number, y: number) => slots.find((s) => s.cell.x === x && s.cell.y === y)!.order;
  const order = (pick: (s: (typeof sprites)[number]) => boolean) => sprites.find(pick)!.order;

  it("places the sprites as placeActors does, untouched by the slots", () => {
    expect(sprites).toEqual(placeActors(prepared, [person]));
    expect(placeWithSlots(prepared, [person], []).slots).toEqual([]);
  });

  it("puts a cell behind furniture under it, and one in front over it", () => {
    const table = order((s) => s.slice === "table");
    expect(slot(1, 0)).toBeLessThanOrEqual(table);
    expect(slot(1, 2)).toBeGreaterThan(table);
  });

  it("draws someone standing on a burning cell over it", () => {
    expect(slot(3, 3)).toBeLessThanOrEqual(order((s) => s.kind === "actor"));
  });

  it("puts every slot after its cell's floor", () => {
    for (const s of slots) expect(s.order).toBeGreaterThan(order((p) => p.kind === "ground" && p.cell.x === s.cell.x && p.cell.y === s.cell.y));
  });
  it("places a neighbour's burning cell in its own room's order, keeping its room", () => {
    const next = { ...floor, id: "NEXT" };
    const both = prepareScene(layout, [{ room: floor, dx: 0, dy: 0 }, { room: next, dx: 4, dy: 0 }]);
    const placed = placeWithSlots(both, [[], []], [{ x: 5, y: 2, scene: 1, room: "NEXT" }]);
    const [s] = placed.slots;
    expect(s).toMatchObject({ cell: { x: 5, y: 2 }, room: "NEXT" });
    const nextTable = placed.sprites.find((p) => p.room === "NEXT" && p.slice === "table")!.order;
    const nextFloor = placed.sprites.find((p) => p.room === "NEXT" && p.kind === "ground" && p.cell.x === 5 && p.cell.y === 2)!.order;
    expect(s!.order).toBeGreaterThan(nextTable);
    expect(s!.order).toBeGreaterThan(nextFloor);
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
  const ship = withoutBuiltOnly({ ...shipArt(), ...JSON.parse(shipMapJson) } as ShipLayout);

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
    // The 1x1 `planets` hologram on (9,21) draws on top of the 2x1 `pilot_astro_center` table on the same front corner.
    expect(order("planets")).toBeGreaterThan(order("pilot_astro_center"));
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

  it("places people into a prepared scene as placeScene would, however often it is reused", () => {
    // Walking re-places only the people (IsoRoom): the tiles are prepared once per room.
    const corridor = ship.rooms.find((r) => r.id === "CORRIDOR_A")!;
    const rooms = [{ room: corridor, dx: 0, dy: 0 }, ...neighborRooms(ship, corridor, 2)];
    const prepared = prepareScene(ship, rooms);
    const cells = walkableCells(ship, corridor);
    for (const n of [1, 4, 0, 6]) {
      const actors = spreadActors(cells, n).map((cell, i) => ({ id: `p${i}`, cell, width: 32, height: 48, ...(i === 1 && { onTop: true }) }));
      const people = [actors, ...rooms.slice(1).map((r, i) => (i % 2 ? [] : [{ id: `${r.room.id}-p`, cell: walkableCells(ship, r.room)[0]!, width: 32, height: 48 }]))];
      expect(placeActors(prepared, people)).toEqual(placeScene(ship, rooms.map((r, i) => ({ ...r, actors: people[i]! }))));
    }
  });

  it("draws fire on the floor in front of the wide console over it, and under someone standing there", () => {
    const command = ship.rooms.find((r) => r.id === "COMMAND_CENTER")!;
    const prepared = prepareScene(ship, [{ room: command, dx: 0, dy: 0 }, ...neighborRooms(ship, command)]);
    const { sprites, slots } = placeWithSlots(prepared, [[{ id: "p", cell: { x: 10, y: 22 }, width: 32, height: 48 }]], [{ x: 10, y: 22 }]);
    const console = sprites.find((s) => s.room === "COMMAND_CENTER" && s.slice === "pilot_astro_right")!.order;
    expect(slots[0]!.order).toBeGreaterThan(console);
    expect(slots[0]!.order).toBeLessThanOrEqual(sprites.find((s) => s.kind === "actor")!.order);
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

  it("has the wall between the bridge and its turret room, which neither original room drew", () => {
    // The turret room's south edge and the bridge's north edge are the same line.
    const command = ship.rooms.find((r) => r.id === "COMMAND_CENTER")!;
    const scene = placeScene(ship, [
      { room: command, dx: 0, dy: 0, actors: [] },
      ...neighborRooms(ship, command).map((n) => ({ ...n, actors: [] })),
    ]);
    // x=17 is the second cell of the bridge's door to the turret (18,12).
    for (const x of [15, 16]) {
      const wall = scene.find((s) => s.kind === "wall" && s.cell.x === x && s.cell.y === 12);
      expect(wall, `x=${x}`).toBeDefined();
    }
  });

  it("puts no wall on the cells a turret's dome leaves without floor", () => {
    // Each Beta dome leaves two cells empty between floor; its art fills them. Front and Center Bravo have the
    // owner's alcove art and layout (2026-11-26), with the turret against a back wall, so only Rear Bravo is left.
    for (const id of ["LASER_TURRET_B_2"]) {
      const room = ship.rooms.find((r) => r.id === id)!;
      const dome = room.tiles[placedEquipment(room).find((p) => p.type === "TURRET_COMMAND")!.tile]!;
      const scene = placeScene(ship, [{ room, dx: 0, dy: 0, actors: [] }]);
      const walls = scene.filter((s) => s.kind === "wall" && dome.x - s.cell.x <= 2 && dome.x >= s.cell.x && dome.y - s.cell.y <= 2 && dome.y >= s.cell.y);
      expect(walls.map((s) => `${s.slice} ${s.cell.x},${s.cell.y}`), id).toEqual([]);
    }
  });

  it("carries hydroponics' wall on to the front corridor's, with a column at the corner", () => {
    // In the original, hydroponics' wall along the corridor stopped at its own front edge, and the
    // corridor's wall in front of hydroponics started one edge further on. The map carries it on to
    // meet it, with a column at the corner, as at the corridor's own top corner.
    const corridor = ship.rooms.find((r) => r.id === "CORRIDOR_A")!;
    const garden = neighborRooms(ship, corridor).find((n) => n.room.id === "HYDROPONIC_CENTER")!;
    const scene = placeScene(ship, [{ room: corridor, dx: 0, dy: 0, actors: [] }, { ...garden, actors: [] }]);
    const gardenWall = garden.room.tiles.filter((t) => t.slice === "BIG_WALL_L");
    const x = gardenWall[0]!.x + garden.dx, y = Math.max(...gardenWall.map((t) => t.y)) + garden.dy;
    expect(scene.filter((s) => s.cell.x === x && s.cell.y === y && s.kind === "wall").map((s) => s.slice).sort()).toEqual(["BIG_WALL_L", "COLUMN"]);
    expect(scene.some((s) => s.kind === "wall" && s.slice === "BIG_WALL_R" && s.cell.x === x + 1 && s.cell.y === y)).toBe(true);
  });

  it("leaves out front-edge doors once the room behind them is drawn", () => {
    for (const r of ship.rooms) {
      const scene = placeScene(ship, [{ room: r, dx: 0, dy: 0, actors: [] }, ...neighborRooms(ship, r).map((n) => ({ ...n, actors: [] }))]);
      const drawn = new Set(scene.map((s) => s.room));
      expect(scene.filter((s) => (s.slice === "DOOR_BL" || s.slice === "DOOR_BR") && drawn.has(s.door!.target)), r.id).toEqual([]);
    }
  });

  it("floors both cells under a door alike, as part of the room whose back wall holds it", () => {
    // The sick bay's door to the front corridor (on the corridor's y=19 edge) is in the sick bay's back wall, and a light path leads to it.
    const corridor = ship.rooms.find((r) => r.id === "CORRIDOR_A")!;
    const door = corridor.tiles.find((t) => t.door?.target === "SICK_BAY")!;
    expect(door.y).toBe(19);
    const scene = placeScene(ship, [
      { room: corridor, dx: 0, dy: 0, actors: [] },
      ...neighborRooms(ship, corridor).map((n) => ({ ...n, actors: [] })),
    ]);
    const floor = (x: number) => scene.filter((s) => s.kind === "ground" && s.cell.x === x && s.cell.y === 19);
    const [a, b] = [floor(door.x - 1), floor(door.x)];
    expect([a.length, b.length]).toEqual([1, 1]);
    expect(a[0]!.room).toBe("SICK_BAY");
    expect(b[0]!.room).toBe("SICK_BAY");
    expect([a[0]!.sx, a[0]!.sy]).toEqual([b[0]!.sx, b[0]!.sy]);
    const plain = scene.find((s) => s.kind === "ground" && s.cell.x === door.x - 1 && s.cell.y === 18)!;
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

describe("walkPath", () => {
  // A 5x3 floor with a wall across x = 2 except at y = 2.
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) if (x !== 2 || y === 2) cells.push({ x, y });

  it("goes around obstacles one grid step at a time, both ends included", () => {
    const path = walkPath(cells, { x: 0, y: 0 }, { x: 4, y: 0 })!;
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path.at(-1)).toEqual({ x: 4, y: 0 });
    expect(path).toHaveLength(9); // 4 across and 2 down and back up
    for (const [i, c] of path.slice(1).entries()) expect(Math.abs(c.x - path[i]!.x) + Math.abs(c.y - path[i]!.y)).toBe(1);
    expect(path).toContainEqual({ x: 2, y: 2 });
  });
  it("is just the cell when already there", () => {
    expect(walkPath(cells, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
  });
  it("is undefined off the floor or with no way through", () => {
    expect(walkPath(cells, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeUndefined();
    expect(walkPath(cells.filter((c) => c.x !== 2), { x: 0, y: 0 }, { x: 4, y: 0 })).toBeUndefined();
  });
  it("takes the walkway when it is as short as the way off it", () => {
    // A 4x4 open floor with a walkway down x = 3 then along y = 3: every staircase from corner to corner is as short.
    const floor: { x: number; y: number; walkway?: boolean }[] = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) floor.push({ x, y, ...((x === 3 || y === 3) && { walkway: true }) });
    const path = walkPath(floor, { x: 0, y: 0 }, { x: 3, y: 3 })!;
    expect(path).toHaveLength(7);
    expect(path.filter((c) => c.x === 3 || c.y === 3)).toHaveLength(4); // straight to the walkway, then along it
    expect(walkPath(floor, { x: 3, y: 0 }, { x: 0, y: 3 })).toEqual([{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 3 }]);
  });
  it("never takes a longer way to stay on a walkway", () => {
    // Floor 0..4 along x at y = 0, with a walkway detour below it.
    const floor: { x: number; y: number; walkway?: boolean }[] = [];
    for (let x = 0; x < 5; x++) floor.push({ x, y: 0 }, { x, y: 1, walkway: true });
    expect(walkPath(floor, { x: 0, y: 0 }, { x: 4, y: 0 })).toHaveLength(5);
  });
  it("finds walkways on the ship's floor", () => {
    const ship = { ...shipArt(), ...JSON.parse(shipMapJson) } as ShipLayout;
    const cells = walkableCells(ship, ship.rooms.find((r) => r.id === "BEDROOM_A")!);
    expect(cells.some((c) => c.walkway)).toBe(true);
    expect(cells.some((c) => !c.walkway)).toBe(true);
  });
});

describe("doorSpot", () => {
  it("is the floor cell nearest the door to that room", () => {
    const cells = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 1, y: 3 }];
    // The door at (0,2) covers (0,1) and (0,2).
    expect(doorSpot(layout, room, "ELSEWHERE", cells)).toEqual({ x: 0, y: 0 });
    expect(doorSpot(layout, room, "NOWHERE", cells)).toBeUndefined();
  });
});

describe("facingFor", () => {
  it("faces down-right on +x, mirrored for +y, and away up-left on -x, mirrored for -y", () => {
    const o = { x: 5, y: 5 };
    expect(facingFor(o, { x: 6, y: 5 })).toEqual({ strip: "face", flip: false });
    expect(facingFor(o, { x: 5, y: 6 })).toEqual({ strip: "face", flip: true });
    expect(facingFor(o, { x: 4, y: 5 })).toEqual({ strip: "back", flip: false });
    expect(facingFor(o, { x: 5, y: 4 })).toEqual({ strip: "back", flip: true });
  });
  it("goes by screen direction between grid points", () => {
    const o = { x: 5, y: 5 };
    expect(facingFor(o, { x: 7, y: 6 })).toEqual({ strip: "face", flip: false }); // mostly +x: down-right
    expect(facingFor(o, { x: 4, y: 3 })).toEqual({ strip: "back", flip: true }); // mostly -y: up-right
    expect(facingFor(o, { x: 4.5, y: 5.5 })).toEqual({ strip: "face", flip: true }); // straight left
  });
});

describe("neighborRooms", () => {
  const ship = withoutBuiltOnly({ ...shipArt(), ...JSON.parse(shipMapJson) } as ShipLayout);
  const room = (id: string) => ship.rooms.find((r) => r.id === id)!;

  it("puts every room where the ship plan does, whichever room you stand in", () => {
    // Door alignment is the plan's job: `npm run ship-check` (tools/tests/shipLayout/check.test.ts).
    for (const r of ship.rooms) {
      for (const n of neighborRooms(ship, r, "all")) {
        expect({ x: r.at!.x + n.dx, y: r.at!.y + n.dy }, `${r.id} / ${n.room.id}`).toEqual(n.room.at);
      }
    }
  });

  it("reaches the whole ship from any room on the plan", () => {
    const planned = ship.rooms.filter((r) => r.at);
    for (const r of planned) expect(neighborRooms(ship, r, "all").length, r.id).toBe(planned.length - 1);
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

describe("doorPassage on the real ship", () => {
  const ship = withoutBuiltOnly({ ...shipArt(), ...JSON.parse(shipMapJson) } as ShipLayout);
  const scenes = new Map<string, ReturnType<typeof prepareScene>>();
  const scene = (r: RoomLayout) => {
    let cached = scenes.get(r.id);
    if (!cached) {
      cached = prepareScene(ship, [{ room: r, dx: 0, dy: 0 }, ...neighborRooms(ship, r)]);
      scenes.set(r.id, cached);
    }
    return cached;
  };
  const walkables = new Map<string, ReturnType<typeof walkableCells>>();
  const walkable = (r: RoomLayout) => {
    let cached = walkables.get(r.id);
    if (!cached) {
      cached = walkableCells(ship, r);
      walkables.set(r.id, cached);
    }
    return cached;
  };
  /** Every pair of rooms with a door between them, from both sides. */
  const pairs = ship.rooms.flatMap((r) =>
    neighborRooms(ship, r).map((n) => ({ from: r, to: n.room, at: r.at! })),
  );

  it("walks through an opening door between every pair of rooms, the same doorway cell from both sides", () => {
    expect(pairs.length).toBeGreaterThan(40);
    const problems: string[] = [];
    for (const { from, to, at } of pairs) {
      const prepared = scene(from);
      const path = doorPassage(prepared, walkable(from), to.id);
      if (!path) {
        problems.push(`${from.id} -> ${to.id}: no way through`);
        continue;
      }
      const inDoor = path.filter((c) => c.door);
      const door = prepared.statics.find((s) => s.key === inDoor[0]?.door);
      if (!door || (ship.slices[door.slice]?.anims.length ?? 0) < 2) problems.push(`${from.id} -> ${to.id}: no door that opens (${door?.slice})`);
      // The doorway cell next to `to` is where you change rooms: the walk on starts there.
      const back = doorPassage(scene(to), walkable(to), from.id)!;
      const cross = inDoor[0]!, other = back.filter((c) => c.door).at(-1)!;
      if (cross.x + at.x !== other.x + to.at!.x || cross.y + at.y !== other.y + to.at!.y) problems.push(`${from.id} -> ${to.id}: doorways differ`);
    }
    expect(problems).toEqual([]);
  });
});

describe("lyingPose", () => {
  const ship = withoutBuiltOnly({ ...shipArt(), ...JSON.parse(shipMapJson) } as ShipLayout);
  const bedTile = (roomId: string) => {
    const room = ship.rooms.find((r) => r.id === roomId)!;
    return { room, tile: placedEquipment(room).find((e) => e.type === "BED")!.tile };
  };

  it("puts the sleeper on the bed tile's cell, shifted and mirrored as the original's binding data says", () => {
    const { room, tile } = bedTile("SICK_BAY");
    const t = room.tiles[tile]!;
    // The sick bay couch: "flipped;ofsx_-14;ofsy_7" (the original's -18, -2, retuned for our cast sheet's frame).
    expect(lyingPose(ship, room, tile)).toEqual({ cell: { x: t.x, y: t.y }, shift: { x: -18, y: 2 }, flip: true });
    // Bedroom B's beds: "ofsx_12;ofsy_1", not flipped.
    const b = bedTile("BEDROOM_B");
    expect(lyingPose(ship, b.room, b.tile)).toMatchObject({ shift: { x: 12, y: 1 }, flip: false });
  });

  it("puts someone on a bed with no binding data in the middle of its footprint", () => {
    const room: RoomLayout = { id: "R", label: "R", tiles: [{ x: 5, y: 5, kind: "entity", layer: 2, slice: "sofa", frame: 0 }], equipment: [{ id: "SOFA", tile: "sofa" }] } as RoomLayout;
    expect(lyingPose(ship, room, 0)).toEqual({ cell: { x: 5, y: 4 }, flip: false });
  });
});

describe("terminalSpot (#192)", () => {
  const ship = withoutBuiltOnly({ ...shipArt(), ...JSON.parse(shipMapJson) } as ShipLayout);

  it("every terminal chair in the map is a chair someone can sit on, on the floor or climbed into from it", () => {
    const chairs: string[] = [];
    const notSeated: string[] = [];
    for (const room of ship.rooms) {
      const cells = walkableCells(ship, room);
      for (const e of placedEquipment(room)) {
        (e.chairs ?? []).forEach((c, i) => {
          chairs.push(e.id);
          const at = terminalSpot(ship, room, e.id, i, cells);
          const step = offFloorStep(cells, c);
          // Climbed into across the turret's base: five cells at most (turret beta's).
          const near = !step || Math.abs(step.x - c.x) + Math.abs(step.y - c.y) <= 5;
          if (at?.chair === undefined || at.cell.x !== c.x || at.cell.y !== c.y || !near) notSeated.push(`${e.id} chair ${i} at ${c.x},${c.y} (step ${JSON.stringify(step)})`);
        });
      }
    }
    // Rear Alpha's turret has no chair since the owner's alcove layout (2026-11-26).
    expect(chairs).toHaveLength(9);
    expect(notSeated).toEqual([]);
  });

  it("stands you at the terminal without a chair, or with a chair number it doesn't have", () => {
    const room = ship.rooms.find((r) => r.id === "LABORATORY")!;
    const cells = walkableCells(ship, room);
    const lab = placedEquipment(room).find((e) => e.id === "LABORATORY:RESEARCH_LAB")!;
    const stand = standSpot(ship, room, lab.tile, cells);
    expect(terminalSpot(ship, room, lab.id, undefined, cells)).toEqual({ cell: stand });
    expect(terminalSpot(ship, room, lab.id, 5, cells)).toEqual({ cell: stand });
    expect(terminalSpot(ship, room, "LABORATORY:NOTHING", 0, cells)).toBeUndefined();
  });

  it("people standing at NERON's core each get a cell of their own, sharing them in turn once all are taken", () => {
    const room = ship.rooms.find((r) => r.id === "NEXUS_ROOM")!;
    const cells = walkableCells(ship, room);
    const core = placedEquipment(room).find((e) => e.id === "NEXUS_ROOM:NERON_CORE")!;
    const spots = standSpots(ship, room, core.tile, cells);
    expect(spots.length).toBeGreaterThanOrEqual(4);
    expect(spots[0]).toEqual(standSpot(ship, room, core.tile, cells));
    const placed = [0, 1, 2, 3].map((n) => terminalSpot(ship, room, core.id, undefined, cells, n)?.cell);
    expect(new Set(placed.map((c) => `${c?.x},${c?.y}`)).size).toBe(4);
    expect(terminalSpot(ship, room, core.id, undefined, cells, spots.length)).toEqual({ cell: spots[0] });
  });

  it("offFloorStep: the nearest floor cell to one off the floor, nothing for one on it", () => {
    const cells = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }];
    expect(offFloorStep(cells, { x: 1, y: 0 })).toBeUndefined();
    expect(offFloorStep(cells, { x: 2, y: 0 })).toEqual({ x: 1, y: 0 });
    expect(offFloorStep(cells, { x: 3, y: 2 })).toEqual({ x: 3, y: 0 });
    expect(offFloorStep([], { x: 3, y: 2 })).toBeUndefined();
    expect(stepsOnto({ x: 3, y: 0 }, { x: 1, y: 2 })).toEqual([{ x: 2, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }]);
  });
});

describe("bay_window paint order", () => {
  const ship = { ...shipArt(), ...JSON.parse(shipMapJson) } as ShipLayout;

  it("draws Alpha Bay 2's bay door behind the dynarcade", () => {
    const ab2 = ship.rooms.find((r) => r.id === "SPACESHIP_BAY_AA")!;
    const sprites = placeScene(ship, [{ room: ab2, dx: 0, dy: 0 }, ...neighborRooms(ship, ab2, 1)]);
    const bayWindow = sprites.find((s) => s.room === "SPACESHIP_BAY_AA" && s.slice === "bay_window")!;
    const dynarcade = sprites.find((s) => s.room === "SPACESHIP_BAY_AA" && s.slice === "dynarcade")!;
    expect(bayWindow.order).toBeLessThan(dynarcade.order);
  });
});
