import { describe, expect, it } from "vitest";
import { shiftTile, tilePosition } from "./skyTurn.ts";

/** Where tile point `t` lands on screen: the tile's transform, position plus rotation. */
const onScreen = (t: { x: number; y: number }, at: { x: number; y: number }, angle: number, center: { x: number; y: number }) => {
  const p = tilePosition(at, angle, center);
  return { x: p.x + Math.cos(angle) * t.x - Math.sin(angle) * t.y, y: p.y + Math.sin(angle) * t.x + Math.cos(angle) * t.y };
};

describe("the star field's turn", () => {
  const center = { x: 400, y: 300 };
  const at = { x: 120, y: 45 };

  it("is the plain offset when unturned", () => {
    expect(tilePosition(at, 0, center)).toEqual(at);
  });

  it("turns about the panel's centre: what is there stays there", () => {
    const t = { x: center.x - at.x, y: center.y - at.y };
    for (const angle of [0.3, Math.PI / 2, -2]) {
      const p = onScreen(t, at, angle, center);
      expect(p.x).toBeCloseTo(center.x);
      expect(p.y).toBeCloseTo(center.y);
    }
  });

  it("streams the way it is pushed on screen, however far it has turned", () => {
    const by = { x: 12, y: 6 };
    for (const angle of [0, 0.7, Math.PI / 2]) {
      const t = { x: 5, y: 9 };
      const before = onScreen(t, at, angle, center);
      const after = onScreen(t, shiftTile(at, by, angle, 1e9), angle, center);
      expect(after.x - before.x).toBeCloseTo(by.x);
      expect(after.y - before.y).toBeCloseTo(by.y);
    }
  });

  it("wraps at the tile's size", () => {
    expect(shiftTile({ x: 500, y: 10 }, { x: 20, y: -20 }, 0, 512)).toEqual({ x: 8, y: 502 });
  });
});
