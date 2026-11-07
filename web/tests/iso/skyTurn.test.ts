import { describe, expect, it } from "vitest";
import { type Spin, shiftTile, stepTurn, tilePosition } from "../../src/iso/skyTurn.ts";

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
