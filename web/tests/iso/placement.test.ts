import { describe, expect, it } from "vitest";
import type { RoomLayout, ShipLayout, SliceInfo } from "@mush2/shared";
import shipLayoutJson from "../../../Mush/derived/ship-layout.json?raw";
import {
  cellAtPoint,
  doorSpot,
  gridToPx,
  hitTest,
  neighborRooms,
  placeActors,
  placeRoom,
  placeScene,
  prepareScene,
  spreadActors,
  standSpot,
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

  it("carries hydroponics' wall on to the front corridor's at the corner neither room draws", () => {
    // Hydroponics' wall along the corridor stops at its own front edge; the corridor's wall in front
    // of hydroponics starts one edge further on. The wall goes on to meet it, with a column at the
    // corner, as at the corridor's own top corner.
    const corridor = ship.rooms.find((r) => r.id === "CORRIDOR_A")!;
    const garden = neighborRooms(ship, corridor).find((n) => n.room.id === "HYDROPONIC_CENTER")!;
    const scene = placeScene(ship, [{ room: corridor, dx: 0, dy: 0, actors: [] }, { ...garden, actors: [] }]);
    const gardenWall = garden.room.tiles.filter((t) => t.slice === "BIG_WALL_L");
    const x = gardenWall[0]!.x + garden.dx, y = Math.max(...gardenWall.map((t) => t.y)) + garden.dy + 1;
    expect(scene.filter((s) => s.cell.x === x && s.cell.y === y && s.kind === "wall").map((s) => s.slice).sort()).toEqual(["BIG_WALL_L", "COLUMN"]);
    expect(scene.some((s) => s.kind === "wall" && s.slice === "BIG_WALL_R" && s.cell.x === x + 1 && s.cell.y === y)).toBe(true);
  });

  it("leaves no wall stopping just short of another room's, whichever room you are in and however far you see", () => {
    // Walls stand on cell edges (a cell's anchor is its top corner): BIG_WALL_L on the cell's +x
    // edge, BIG_WALL_R on its +y edge, corner_02 on both, a door on its two cells' edges, and a
    // COLUMN is a post on the +x+y corner. A wall end that touches no other wall or post is a gap
    // when another room's wall is within two edges along its line. A wall stopping with nothing in
    // reach is fine: the open front edges (the Bravo side of most rooms) and the hull. The ends
    // below are left on purpose; positions are on the ship plan, so moving rooms changes them
    // (look at each with `npm run ship-view` before pinning it).
    const LEFT: Record<string, string> = {
      "LASER_TURRET_A_0 -34,18": "under the bridge's consoles",
      "LASER_TURRET_A_1 -1,6": "behind Bay Alpha's deck wall, which carries on past it",
      "CORRIDOR_A -2,23": "a sprinkler is mounted on the centre corridor's wall where it would go",
      "LASER_TURRET_A_2 42,12": "behind the motor room's door",
      "CORRIDOR_B -1,37": "behind Bay Beta's deck wall, and a camera is where it would go",
      "LASER_TURRET_B_1 -1,39": "behind Bay Beta's deck wall, which carries on past it",
      "STORAGE_B_0 4,37": "behind Bay Beta's deck wall, which carries on past it",
      "BEDROOM_B 12,37": "behind Bay Beta's deck wall, which carries on past it",
      "MOTOR_ROOM 39,37": "behind the Icarus bay's deck wall, which carries on past it",
      "STORAGE_B_1 27,37": "the Icarus bay's deck corner post stands where it would go, and covers it",
    };
    const RUNS: Record<string, string> = { BIG_WALL_L: "y", WALL_L_DECK: "y", BIG_WALL_R: "x", WALL_R_DECK: "x", corner_02: "xy" };
    const gaps = new Set<string>();
    for (const r of ship.rooms.filter((r) => r.at)) {
      for (const depth of [1, "all"] as const) {
        const { x: ax, y: ay } = r.at!;
        const scene = placeScene(ship, [
          { room: r, dx: ax, dy: ay, actors: [] },
          ...neighborRooms(ship, r, depth).map((n) => ({ ...n, dx: n.dx + ax, dy: n.dy + ay, actors: [] })),
        ]);
        const edges: { a: [number, number]; b: [number, number]; room: string }[] = [];
        const rooms = new Map<string, Set<string>>();
        const mark = ([x, y]: [number, number], room: string) => rooms.set(`${x},${y}`, (rooms.get(`${x},${y}`) ?? new Set()).add(room));
        for (const s of scene) {
          const { x, y } = s.cell;
          const edge = (axis: "x" | "y", ex: number, ey: number) => edges.push({ a: [ex, ey], b: axis === "x" ? [ex + 1, ey] : [ex, ey + 1], room: s.room });
          if (s.kind === "wall") {
            if (s.slice === "COLUMN" || s.slice === "CORNER_DECK") mark([x + 1, y + 1], s.room);
            if (RUNS[s.slice]?.includes("x")) edge("x", x, y + 1);
            if (RUNS[s.slice]?.includes("y")) edge("y", x + 1, y);
          } else if (s.kind === "door" && !s.slice.startsWith("DOOR_B")) {
            const [w] = ship.slices[s.slice]!.footprint ?? [1, 1];
            if (w > 1) edge("x", x, y + 1), edge("x", x - 1, y + 1);
            else edge("y", x + 1, y), edge("y", x + 1, y - 1);
          }
        }
        const touching = new Map<string, number>();
        for (const e of edges) for (const [x, y] of [e.a, e.b]) touching.set(`${x},${y}`, (touching.get(`${x},${y}`) ?? 0) + 1);
        const posts = new Set(rooms.keys());
        for (const e of edges) for (const [x, y] of [e.a, e.b]) mark([x, y], e.room);
        for (const e of edges) {
          for (const [p, q] of [[e.a, e.b], [e.b, e.a]] as const) {
            if (touching.get(`${p[0]},${p[1]}`) !== 1 || posts.has(`${p[0]},${p[1]}`)) continue;
            for (let n = 1; n <= 2; n++) {
              const there = rooms.get(`${p[0] + (p[0] - q[0]) * n},${p[1] + (p[1] - q[1]) * n}`);
              if (!there) continue;
              const end = `${e.room} ${p[0]},${p[1]}`;
              if ([...there].some((o) => o !== e.room) && !LEFT[end]) gaps.add(`${end}: stops ${n} short of ${[...there].join("/")}'s wall (from ${r.id}, depth ${depth})`);
              break;
            }
          }
        }
      }
    }
    expect([...gaps]).toEqual([]);
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
  const ship = JSON.parse(shipLayoutJson) as ShipLayout;
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
