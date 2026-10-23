import { describe, expect, it } from "vitest";
import type { ShipLayout } from "@mush2/shared";
import shipArtJson from "../../../Mush/derived/ship-art.json?raw";
import shipMapJson from "../../../Mush/derived/ship-map.json?raw";
import { gridToPx, neighborRooms, placeScene } from "../../src/iso/placement.ts";
import { cellAt, footprint, layerOf, roomOutlines, shipCells, shipScene, tileOf } from "../../src/editor/shipScene.ts";

const ship = { ...JSON.parse(shipArtJson), ...JSON.parse(shipMapJson) } as ShipLayout;

describe("shipScene", () => {
  const scene = shipScene(ship);

  it("draws what the game draws from the front corridor with every room in view, on ship cells", () => {
    const corridor = ship.rooms.find((r) => r.id === "CORRIDOR_A")!;
    const { x, y } = corridor.at!;
    const game = placeScene(ship, [
      { room: corridor, dx: x, dy: y, actors: [] },
      ...neighborRooms(ship, corridor, "all").map((n) => ({ ...n, dx: n.dx + x, dy: n.dy + y, actors: [] })),
    ]);
    expect(scene.map((s) => `${s.key} ${s.left},${s.top}`)).toEqual(game.map((s) => `${s.key} ${s.left},${s.top}`));
  });

  it("names each sprite's map tile, and puts it on the ship cell its room's position gives", () => {
    for (const s of scene.filter((_, i) => i % 97 === 0)) {
      const ref = tileOf(ship, s)!;
      expect(ref.room.id).toBe(s.room);
      expect(ref.tile.slice).toBe(s.slice);
      expect(s.cell).toEqual({ x: ref.tile.x + ref.room.at!.x, y: ref.tile.y + ref.room.at!.y });
    }
  });
});

describe("cellAt", () => {
  it("finds the cell whose diamond holds a pixel, the inverse of gridToPx", () => {
    for (const [x, y] of [[0, 0], [3, -7], [-12, 5]] as const) {
      const top = gridToPx(x, y);
      // Just inside each corner of the diamond.
      expect(cellAt(top.x, top.y + 1)).toEqual({ x, y });
      expect(cellAt(top.x + 14, top.y + 8)).toEqual({ x, y });
      expect(cellAt(top.x - 14, top.y + 8)).toEqual({ x, y });
      expect(cellAt(top.x, top.y + 15)).toEqual({ x, y });
    }
  });
});

describe("overlays", () => {
  it("covers a tile's footprint toward -x/-y on ship cells", () => {
    const room = { id: "R", label: "R", tiles: [], equipment: [], at: { x: 10, y: 20 } };
    const layout = { slices: { desk: { footprint: [2, 3] } } } as unknown as ShipLayout;
    const cells = footprint(layout, room, { x: 1, y: 2, kind: "entity", layer: 2, slice: "desk", frame: 0 });
    expect(cells).toHaveLength(6);
    expect(cells).toContainEqual({ x: 11, y: 22 });
    expect(cells).toContainEqual({ x: 10, y: 20 });
  });

  it("outlines every room on the plan with floor, and none off it", () => {
    const outlines = roomOutlines(ship);
    expect(outlines.map((o) => o.id)).toContain("CORRIDOR_A");
    expect(outlines.map((o) => o.id)).not.toContain("PLANET");
    for (const o of outlines) expect(o.path.length, o.id).toBeGreaterThan(0);
  });

  it("spans every tile on the plan", () => {
    const c = shipCells(ship);
    for (const s of shipScene(ship)) {
      expect(s.cell.x >= c.x0 && s.cell.x <= c.x1 && s.cell.y >= c.y0 && s.cell.y <= c.y1).toBe(true);
    }
  });

  it("gives doors their own layer toggle, and people in none", () => {
    expect([layerOf("door"), layerOf("wall"), layerOf("ground"), layerOf("actor")]).toEqual(["door", "wall", "ground", undefined]);
  });
});
