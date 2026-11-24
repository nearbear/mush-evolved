// The star field's turn and orbit (PixiRenderer). When the ship turns, its tiled layers turn the other way about the
// panel's centre while they keep streaming down-right on screen. In orbit, the near stars glide counterclockwise along
// 2D bipolar elliptical streamlines with two visible poles (upper-right and lower-left of the 2:1 equator — pure 2D, no
// 3D), while the nebula backdrop stays undistorted. Pure math, no Pixi, so it is tested on its own.

export type Point = { x: number; y: number };

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Unit vector down-right along the 2:1 cruising slope, and up-right perpendicular to it. */
const INV_SQRT5 = 1 / Math.sqrt(5);
const EU_X = 2 * INV_SQRT5;
const EU_Y = INV_SQRT5;
const EV_X = INV_SQRT5;
const EV_Y = -2 * INV_SQRT5;

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

/**
 * 2D bipolar elliptical streamlines with two visible poles at `center ± poleDist * e_v` (upper-right and lower-left of
 * the 2:1 equator). For any off-equator point `(u, v)`, its streamline is the unique 2D ellipse
 * `(u / (aspect * r))² + ((v - c) / r)² = 1` in the bipolar family (`c = ((u/aspect)² + v² + d²) / (2v)`,
 * `r = √(c² - d²)`), shrinking to the two pole points as `|c| → d` and flattening into the straight 2:1 equator at `v = 0`.
 */
export interface OrbitField {
  center: Point;
  /** Distance from `center` along `e_v` to each of the two visible poles (`±poleDist`). */
  poleDist: number;
  /** Horizontal-to-vertical aspect ratio of the ellipses along the 2:1 cruising axis `u`. */
  aspect: number;
  /** Off-screen wrap boundary along `u` for wide equator ellipses. */
  uLimit: number;
  /** Off-screen seeding reach along `v`. */
  vLimit: number;
}

/** Builds the two-pole elliptical streamline field with both poles just off-screen (upper-right and lower-left). */
export function orbitField(screen: { width: number; height: number }): OrbitField {
  const w = Math.max(1, screen.width);
  const h = Math.max(1, screen.height);
  const uMax = (w + h / 2) * INV_SQRT5;
  const vMax = (w / 2 + h) * INV_SQRT5;
  const poleDist = 0.7 * Math.max(h, w * 0.5);
  return {
    center: { x: w / 2, y: h / 2 },
    poleDist,
    aspect: 1.4,
    uLimit: uMax + 64,
    vLimit: Math.max(vMax, poleDist) + 256,
  };
}

/** The screen coordinates of the two visible poles (upper-right, lower-left). */
export function orbitPoles(field: OrbitField): [Point, Point] {
  const dx = field.poleDist * EV_X;
  const dy = field.poleDist * EV_Y;
  return [
    { x: field.center.x + dx, y: field.center.y + dy },
    { x: field.center.x - dx, y: field.center.y - dy },
  ];
}

/**
 * Advances a star `p` by signed distance `dist` (negative = counterclockwise / up-left along the equator) along its
 * exact 2D bipolar ellipse in `field`. Stars around either pole orbit forever with zero drift; wide equator ellipses
 * that leave past `±uLimit` (off-screen) re-enter on the opposite side of the exact same ellipse.
 */
export function stepOrbitStar(p: Point, field: OrbitField, dist: number): Point {
  const dx = p.x - field.center.x;
  const dy = p.y - field.center.y;
  const u0 = dx * EU_X + dy * EU_Y;
  const v0 = dx * EV_X + dy * EV_Y;
  const { poleDist: d, aspect, uLimit } = field;
  const uBar0 = u0 / aspect;

  let u: number;
  let v: number;
  if (Math.abs(v0) < 1e-3) {
    u = u0 + dist;
    v = v0;
  } else {
    const c = (uBar0 * uBar0 + v0 * v0 + d * d) / (2 * v0);
    const r = Math.hypot(uBar0, v0 - c);
    const theta = Math.atan2(v0 - c, uBar0) + dist / (c * aspect);
    u = aspect * r * Math.cos(theta);
    v = c + r * Math.sin(theta);
  }

  if (u > uLimit) u = -uLimit + (u - uLimit);
  else if (u < -uLimit) u = uLimit + (u + uLimit);

  return {
    x: field.center.x + u * EU_X + v * EV_X,
    y: field.center.y + u * EU_Y + v * EV_Y,
  };
}

/** The four corners (in screen space) of the flat tile box seeded when entering orbit. */
export function orbitSearchCorners(field: OrbitField): readonly Point[] {
  const { uLimit: u, vLimit: v } = field;
  const toScreen = (uu: number, vv: number): Point => ({
    x: field.center.x + uu * EU_X + vv * EV_X,
    y: field.center.y + uu * EU_Y + vv * EV_Y,
  });
  return [toScreen(-u, -v), toScreen(u, -v), toScreen(-u, v), toScreen(u, v)];
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
