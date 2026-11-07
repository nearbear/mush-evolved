import { describe, expect, it } from "vitest";
import { bakeScale, cylinder, flatBounds, flatRectAt, podLayout, roll, unroll } from "../../src/lobby/podGeometry.ts";

describe("the pod's bend", () => {
  const desktop = cylinder(856, 664);
  const phone = cylinder(320, 560);

  it("places a flat rectangle so the bend draws it over the given box", () => {
    const r = flatRectAt(desktop, 330, 420, 176, 60)!;
    const centre = roll(desktop, r.x + r.width / 2 - desktop.width / 2, r.y + r.height / 2 - desktop.height / 2);
    expect(centre.x).toBeCloseTo(330, 6);
    expect(centre.y).toBeCloseTo(420, 6);
    const top = roll(desktop, r.x + r.width / 2 - desktop.width / 2, r.y - desktop.height / 2);
    const bottom = roll(desktop, r.x + r.width / 2 - desktop.width / 2, r.y + r.height - desktop.height / 2);
    expect(bottom.y - top.y).toBeCloseTo(60, 6);
    expect(flatRectAt(desktop, 10 * desktop.width, 0, 176, 60)).toBeNull();
  });

  it("leaves the window's centre where it is", () => {
    expect(unroll(desktop, 0, 0)).toEqual({ s: 0, y: 0 });
    expect(roll(desktop, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("undoes the bend it draws", () => {
    for (const c of [desktop, phone]) {
      for (const s of [-0.9, -0.5, -0.2, 0.1, 0.4, 1.1].map((f) => f * c.width)) {
        for (const y of [-300, 0, 120]) {
          const at = roll(c, s, y);
          const back = unroll(c, at.x, at.y)!;
          expect(back.s).toBeCloseTo(s, 6);
          expect(back.y).toBeCloseTo(y, 6);
        }
      }
    }
  });

  it("dips the top edge toward the middle, where the lid is farthest", () => {
    const top = -desktop.height / 2;
    expect(roll(desktop, 0, top).y).toBeCloseTo(top);
    expect(roll(desktop, desktop.width / 2, top).y).toBeLessThan(top);
  });

  it("draws nothing past the wall's edge", () => {
    expect(unroll(desktop, 5000, 0)).toBeNull();
    expect(unroll(desktop, -5000, 0)).toBeNull();
  });
});

describe("the flat drawing", () => {
  it("covers no more than the screen's height", () => {
    const c = cylinder(856, 664);
    const b = flatBounds(podLayout(856, 664, 16, false), c, -118, 900 - 118);
    expect(b.y).toBe(-118);
    expect(b.y + b.height).toBeLessThanOrEqual(900 - 118 + 1);
  });

  it("keeps within the GPU's limits", () => {
    const big = { x: 0, y: 0, width: 5000, height: 3000 };
    const s = bakeScale(big, 3, 4096);
    expect(big.width * s).toBeLessThanOrEqual(4096);
    expect(big.width * big.height * s * s).toBeLessThanOrEqual(8e6 + 1);
    expect(bakeScale({ x: 0, y: 0, width: 400, height: 400 }, 3, 4096)).toBe(2);
  });
});
