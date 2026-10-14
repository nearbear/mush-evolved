import { describe, expect, it } from "vitest";
import planJson from "@mush2/assets/derived/ship-plan.json";
import type { CellRun, ShipPlan } from "@mush2/shared";
import { cellsPath, iconSpots, runsPath } from "./plan.ts";

const plan = planJson as ShipPlan;

describe("runsPath", () => {
  it("draws one rectangle per run", () => {
    expect(runsPath([[2, 3, 4]])).toBe("M2 3h4v1h-4z");
    expect(cellsPath([[1, 1], [2, 1]])).toBe("M1 1h1v1h-1zM2 1h1v1h-1z");
  });
});

describe("iconSpots", () => {
  /** True when the icon's square covers only cells of the room. */
  const clear = (runs: CellRun[], p: { x: number; y: number }, size: number) => {
    const cells = new Set(runs.flatMap(([x, y, n]) => Array.from({ length: n }, (_, i) => `${x + i},${y}`)));
    for (let x = Math.floor(p.x - size / 2 + 1e-6); x < Math.ceil(p.x + size / 2 - 1e-6); x++) {
      for (let y = Math.floor(p.y - size / 2 + 1e-6); y < Math.ceil(p.y + size / 2 - 1e-6); y++) {
        if (!cells.has(`${x},${y}`)) return false;
      }
    }
    return true;
  };

  it("keeps every icon clear of the walls in every room of the real plan", () => {
    for (const room of plan.rooms) {
      for (const n of [1, 3, 8, 40]) {
        const { size, spots } = iconSpots(room.runs, n, 3.2);
        expect(spots).toHaveLength(n);
        expect(size).toBeGreaterThanOrEqual(1);
        expect(size).toBeLessThanOrEqual(3.2);
        for (const p of spots) expect(clear(room.runs, p, size), `${room.id} with ${n}`).toBe(true);
      }
    }
  });

  it("uses the full size where it fits and shrinks in narrow rooms", () => {
    expect(iconSpots([[0, 0, 10], [0, 1, 10], [0, 2, 10], [0, 3, 10]], 1, 3.2).size).toBe(3.2);
    const corridor = iconSpots([[0, 0, 10], [0, 1, 10]], 1, 3.2);
    expect(corridor.size).toBe(2);
    expect(corridor.spots[0]!.y).toBe(1);
  });

  it("spreads people out instead of stacking them", () => {
    const { spots } = iconSpots([[0, 0, 12], [0, 1, 12]], 3, 2);
    expect(new Set(spots.map((p) => p.x)).size).toBe(3);
  });

  it("handles an empty room and nobody", () => {
    expect(iconSpots([], 2, 3).spots).toEqual([]);
    expect(iconSpots([[0, 0, 3]], 0, 3).spots).toEqual([]);
  });
});
