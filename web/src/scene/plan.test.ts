import { describe, expect, it } from "vitest";
import planJson from "@mush2/assets/derived/ship-plan.json";
import type { CellRun, ShipPlan } from "@mush2/shared";
import { cellsPath, runsPath, spots } from "./plan.ts";

const plan = planJson as ShipPlan;

describe("runsPath", () => {
  it("draws one rectangle per run", () => {
    expect(runsPath([[2, 3, 4]])).toBe("M2 3h4v1h-4z");
    expect(cellsPath([[1, 1], [2, 1]])).toBe("M1 1h1v1h-1zM2 1h1v1h-1z");
  });
});

describe("spots", () => {
  const inside = (runs: CellRun[], p: { x: number; y: number }) =>
    runs.some(([x, y, n]) => p.y > y && p.y < y + 1 && p.x > x && p.x < x + n);

  it("keeps everyone inside every room of the real plan", () => {
    for (const room of plan.rooms) {
      for (const n of [1, 3, 8, 40]) {
        const placed = spots(room.runs, n);
        expect(placed).toHaveLength(n);
        for (const p of placed) expect(inside(room.runs, p), `${room.id} with ${n}`).toBe(true);
      }
    }
  });

  it("spreads people out instead of stacking them", () => {
    const placed = spots([[0, 0, 10]], 3);
    expect(new Set(placed.map((p) => p.x)).size).toBe(3);
  });

  it("handles an empty room and nobody", () => {
    expect(spots([], 2)).toEqual([]);
    expect(spots([[0, 0, 3]], 0)).toEqual([]);
  });
});
