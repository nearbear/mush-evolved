// The star field's turn (PixiRenderer): when the ship turns, its tiled layers turn the other way about the panel's
// centre while they keep streaming down-right on screen. A layer's offset is kept in the tile's own (turned) frame, so a
// turn never swings the pattern about some far-off point. Pure math, no Pixi, so it is tested on its own.

type Point = { x: number; y: number };

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** The offset `at` after the layer moves `by` on screen, turned back into the tile's frame and wrapped at the tile's `size`. */
export function shiftTile(at: Point, by: Point, angle: number, size: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: mod(at.x + cos * by.x + sin * by.y, size), y: mod(at.y - sin * by.x + cos * by.y, size) };
}

/** Where the tile goes on screen (a TilingSprite's `tilePosition`, with `tileRotation` = `angle`) to turn it about `center`. */
export function tilePosition(at: Point, angle: number, center: Point): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const vx = at.x - center.x;
  const vy = at.y - center.y;
  return { x: center.x + cos * vx - sin * vy, y: center.y + sin * vx + cos * vy };
}

/** How the stars turn toward where they should point: at most `speed` (radians a second), speeding up and slowing down at `accel` (radians a second, each second). */
export type TurnLimits = { speed: number; accel: number };
export type Spin = { angle: number; velocity: number };

/**
 * One step of `dt` seconds turning `spin` toward `target`, like a body with inertia: it speeds up at `accel` to at most
 * `speed`, then brakes at `accel` so it comes to rest on the target. A new target mid-turn keeps the velocity it has,
 * so turning back first slows it down. Lands exactly on the target, at rest.
 */
export function stepTurn(spin: Spin, target: number, dt: number, { speed, accel }: TurnLimits): Spin {
  const left = target - spin.angle;
  // The fastest it can go here and still stop on the target.
  const want = Math.sign(left) * Math.min(speed, Math.sqrt(2 * accel * Math.abs(left)));
  const v = spin.velocity;
  // Braking follows the stopping curve; anything else (speeding up, reversing) is limited to `accel`.
  const braking = Math.sign(want) === Math.sign(v) && Math.abs(want) < Math.abs(v);
  const velocity = braking ? want : v + Math.max(-accel * dt, Math.min(accel * dt, want - v));
  const step = velocity * dt;
  if (Math.abs(left) <= Math.abs(step) && Math.sign(step) === Math.sign(left)) return { angle: target, velocity: 0 };
  return { angle: spin.angle + step, velocity };
}
