import { describe, expect, it } from "vitest";
import { orbitField, orbitPoles, orbitSearchCorners, shiftTile, type Spin, stepOrbitStar, stepTurn, tilePosition } from "../../src/iso/skyTurn.ts";

/** Where tile point `u` lands on screen: Pixi's tilePosition plus `u` turned by `angle`. */
const onScreen = (u: { x: number; y: number }, at: { x: number; y: number }, angle: number, center: { x: number; y: number }) => {
  const pos = tilePosition(at, angle, center);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: pos.x + cos * u.x - sin * u.y, y: pos.y + sin * u.x + cos * u.y };
};

const INV_SQRT5 = 1 / Math.sqrt(5);
const toUV = (p: { x: number; y: number }, center: { x: number; y: number }) => {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { u: (2 * dx + dy) * INV_SQRT5, v: (dx - 2 * dy) * INV_SQRT5 };
};
const fromUV = (u: number, v: number, center: { x: number; y: number }) => ({
  x: center.x + (2 * u + v) * INV_SQRT5,
  y: center.y + (u - 2 * v) * INV_SQRT5,
});

describe("the star field's turn", () => {
  const center = { x: 400, y: 300 };
  const at = { x: 120, y: 45 };

  it("is the plain offset when unturned", () => {
    expect(tilePosition(at, 0, center)).toEqual(at);
  });

  it("turns about the panel's centre: what is there stays there", () => {
    const u = { x: center.x - at.x, y: center.y - at.y };
    for (const angle of [0.3, Math.PI / 2, -2]) {
      const p = onScreen(u, at, angle, center);
      expect(p.x).toBeCloseTo(center.x);
      expect(p.y).toBeCloseTo(center.y);
    }
  });

  it("streams the way it is pushed on screen, however far it has turned", () => {
    const by = { x: 12, y: 6 };
    for (const angle of [0, 0.7, Math.PI / 2, -1.3]) {
      const u = { x: 5, y: 9 };
      const before = onScreen(u, at, angle, center);
      const after = onScreen(u, shiftTile(at, by, angle, 1e9), angle, center);
      expect(after.x - before.x).toBeCloseTo(by.x);
      expect(after.y - before.y).toBeCloseTo(by.y);
    }
  });

  it("wraps at the tile's size", () => {
    expect(shiftTile({ x: 500, y: 10 }, { x: 20, y: -20 }, 0, 512)).toEqual({ x: 8, y: 502 });
  });
});

describe("the star field's two-pole orbit streamlines", () => {
  const screen = { width: 1600, height: 900 };
  const field = orbitField(screen);

  it("places both poles just off-screen as stationary fixed points of the flow", () => {
    const [topPole, botPole] = orbitPoles(field);
    expect(topPole.y).toBeLessThan(0);
    expect(botPole.y).toBeGreaterThan(screen.height);
    for (const pole of [topPole, botPole]) {
      const next = stepOrbitStar(pole, field, -50);
      expect(next.x).toBeCloseTo(pole.x, 4);
      expect(next.y).toBeCloseTo(pole.y, 4);
    }
  });

  it("keeps every off-equator star on its exact 2D bipolar ellipse and keeps the equator straight", () => {
    const eq0 = fromUV(100, 0, field.center);
    const eq1 = stepOrbitStar(eq0, field, -40);
    expect(toUV(eq1, field.center).u).toBeCloseTo(60, 5);
    expect(toUV(eq1, field.center).v).toBeCloseTo(0, 5);

    for (const start of [fromUV(120, 260, field.center), fromUV(-150, -300, field.center)]) {
      const { u: u0, v: v0 } = toUV(start, field.center);
      const uBar0 = u0 / field.aspect;
      const c = (uBar0 * uBar0 + v0 * v0 + field.poleDist * field.poleDist) / (2 * v0);
      const r = Math.hypot(uBar0, v0 - c);
      let cur = start;
      for (let i = 0; i < 20; i++) {
        cur = stepOrbitStar(cur, field, -15);
        const { u, v } = toUV(cur, field.center);
        expect((u / (field.aspect * r)) ** 2 + ((v - c) / r) ** 2).toBeCloseTo(1, 6);
      }
    }
  });

  it("moves counterclockwise around the lower-left pole (and up-left along the equator) for negative dist", () => {
    const [, botPole] = orbitPoles(field);
    // Just right of the lower-left pole, moving counterclockwise on screen (y down) goes upward (smaller y).
    const rightOfPole = { x: botPole.x + 60, y: botPole.y };
    const next = stepOrbitStar(rightOfPole, field, -5);
    expect(next.y).toBeLessThan(rightOfPole.y);
  });

  it("wraps wide equator ellipses off-screen onto the opposite side of the same ellipse", () => {
    const nearEdge = fromUV(-field.uLimit + 5, 10, field.center);
    const wrapped = stepOrbitStar(nearEdge, field, -20);
    const { u, v } = toUV(wrapped, field.center);
    expect(u).toBeGreaterThan(field.uLimit - 30);
    // Still on the same upper-half wide ellipse (symmetric in u).
    expect(v).toBeGreaterThan(9);
    expect(v).toBeLessThan(12);
  });

  it("covers the full canvas inside orbitSearchCorners", () => {
    const corners = orbitSearchCorners(field).map((c) => toUV(c, field.center));
    const uMin = Math.min(...corners.map((c) => c.u));
    const uMax = Math.max(...corners.map((c) => c.u));
    const vMin = Math.min(...corners.map((c) => c.v));
    const vMax = Math.max(...corners.map((c) => c.v));
    for (const target of [
      { x: 0, y: 0 },
      { x: screen.width, y: 0 },
      { x: 0, y: screen.height },
      { x: screen.width, y: screen.height },
    ]) {
      const { u, v } = toUV(target, field.center);
      expect(u).toBeGreaterThan(uMin);
      expect(u).toBeLessThan(uMax);
      expect(v).toBeGreaterThan(vMin);
      expect(v).toBeLessThan(vMax);
    }
  });
});

describe("the star field's inertia", () => {
  const limits = { speed: 0.24, accel: 0.08 };
  const dt = 1 / 60;
  /** Steps toward `target` until at rest there, recording each step. */
  const run = (from: Spin, target: number, max = 10_000) => {
    const steps: Spin[] = [];
    let s = from;
    while (steps.length < max && (s.angle !== target || s.velocity !== 0)) steps.push((s = stepTurn(s, target, dt, limits)));
    return steps;
  };

  it("comes to rest exactly on the target, in about the time a trapezoid takes", () => {
    const steps = run({ angle: 0, velocity: 0 }, Math.PI / 2);
    expect(steps.at(-1)).toEqual({ angle: Math.PI / 2, velocity: 0 });
    // speed / accel to speed up and again to slow down, the rest at full speed: about 9.5 s.
    const expected = Math.PI / 2 / limits.speed + limits.speed / limits.accel;
    expect(steps.length * dt).toBeGreaterThan(expected - 0.2);
    expect(steps.length * dt).toBeLessThan(expected + 0.2);
  });

  it("eases in and out without passing the target or the speed limit", () => {
    const steps = run({ angle: 0, velocity: 0 }, -Math.PI / 2);
    let prev = { angle: 0, velocity: 0 };
    // Braking follows the stopping curve step by step, up to about 15% over `accel` in the last frames; the last step snaps to rest.
    for (const s of steps.slice(0, -1)) {
      expect(s.angle).toBeLessThanOrEqual(prev.angle);
      expect(s.angle).toBeGreaterThanOrEqual(-Math.PI / 2);
      expect(Math.abs(s.velocity)).toBeLessThanOrEqual(limits.speed + 1e-9);
      expect(Math.abs(s.velocity - prev.velocity)).toBeLessThanOrEqual(limits.accel * dt * 1.2);
      prev = s;
    }
  });

  it("keeps its momentum when the target flips: it slows down before turning back", () => {
    const steps = run({ angle: 0.5, velocity: 0.24 }, 0);
    expect(steps[0]?.angle).toBeGreaterThan(0.5);
    expect(Math.max(...steps.map((s) => s.angle))).toBeGreaterThan(0.8);
    expect(steps.at(-1)).toEqual({ angle: 0, velocity: 0 });
  });

  it("stays put at rest on the target", () => {
    expect(stepTurn({ angle: 1, velocity: 0 }, 1, dt, limits)).toEqual({ angle: 1, velocity: 0 });
  });
});
