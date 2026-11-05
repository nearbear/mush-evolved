// The cryopod's geometry, pure (no DOM): where each part of the pod sits, and how the flat drawing of
// it is bent onto the half-cylinder of the lid. The Pixi backdrop (pixi/PodRenderer.ts) bakes the flat
// drawing (podArt.ts) and bends it on the GPU with `unroll`, written again in GLSL there: change both.
//
// The bend is the one the CSS version made with tilted strips: the lid is a cylinder whose middle is
// farthest from you, seen in perspective from in front of the window's centre. A point at arc length
// s along the cylinder (0 at the middle) and height y sits at
//   X = r sin φ, Z = r (1 - cos φ), with φ = s / r,
// and is drawn at (X, y) * p / (p - Z), relative to the window's centre.

/** How much of the cylinder the window covers, in radians: more is a deeper curve. */
export const ARC = 1.3;
/**
 * Viewing distance, as a multiple of the window's longer side: smaller exaggerates the curve. The
 * longer side, not the width, so a tall phone window doesn't flare at the ends.
 */
export const DEPTH = 1.6;
/** The metal wall carries the cylinder on past each side of the window by this share of its width. */
export const WALL_SIDE = 2 / 3;
/** Light from the left: brightness is 1 + LIGHT * s / width, so the left of the curve turns away. */
export const LIGHT = 0.3;
/** The darkness past the wall's lit area, and behind everything. */
export const DARK = "#02060c";

export interface Cylinder {
  /** The window's size, in CSS pixels. */
  width: number;
  height: number;
  /** The cylinder's radius: the window's width laid along ARC of it, so nothing stretches. */
  r: number;
  /** Perspective distance. */
  p: number;
  /** The wall's edge, as an angle from the middle; nothing is drawn past it. */
  maxPhi: number;
}

export function cylinder(width: number, height: number): Cylinder {
  return {
    width,
    height,
    r: width / ARC,
    p: Math.max(width, height) * DEPTH,
    maxPhi: ARC * (0.5 + WALL_SIDE),
  };
}

/** Where a flat point (s along the curve, y down, both from the window's centre) is drawn on screen. */
export function roll(c: Cylinder, s: number, y: number): { x: number; y: number } {
  const phi = s / c.r;
  const k = c.p / (c.p - c.r * (1 - Math.cos(phi)));
  return { x: c.r * Math.sin(phi) * k, y: y * k };
}

/**
 * The inverse of `roll`: the flat point drawn at screen offset (dx, dy) from the window's centre, or
 * null past the wall's edge. Solves dx (p - r + r cos φ) = p r sin φ for φ in closed form, as
 * A sin φ - B cos φ = C, so φ = atan2(B, A) + asin(C / √(A² + B²)).
 */
export function unroll(c: Cylinder, dx: number, dy: number): { s: number; y: number } | null {
  const a = c.p * c.r;
  const b = dx * c.r;
  const k = (dx * (c.p - c.r)) / Math.hypot(a, b);
  if (Math.abs(k) > 1) return null;
  const phi = Math.atan2(b, a) + Math.asin(k);
  if (Math.abs(phi) > c.maxPhi) return null;
  return { s: c.r * phi, y: (dy * (c.p - c.r * (1 - Math.cos(phi)))) / c.p };
}

/**
 * Where to draw a rectangle in the flat drawing so the bend puts it on a box seen at screen offset
 * (dx, dy) from the window's centre (the box's centre), `width` by `height`: its centre unrolled, its
 * height shrunk by the bend's vertical stretch there. Null past the wall's edge.
 */
export function flatRectAt(c: Cylinder, dx: number, dy: number, width: number, height: number): Rect | null {
  const at = unroll(c, dx, dy);
  if (!at) return null;
  const k = c.p / (c.p - c.r * (1 - Math.cos(at.s / c.r)));
  const h = height / k;
  return { x: c.width / 2 + at.s - width / 2, y: c.height / 2 + at.y - h / 2, width, height: h };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One corner's radii. */
export interface Radius {
  x: number;
  y: number;
}

/**
 * The pod's outline: wide rounded corners, fuller at the bottom, as percentages of the box. The edges
 * between them are kept straight on purpose: the curve bends them, and an oval would hide that.
 * Corners in canvas `roundRect` order: top left, top right, bottom right, bottom left.
 */
export function podRadii(width: number, height: number): Radius[] {
  const top = { x: 0.22 * width, y: 0.16 * height };
  const bottom = { x: 0.26 * width, y: 0.22 * height };
  return [top, top, bottom, bottom];
}

export const inset = (r: Rect, by: number): Rect => ({ x: r.x + by, y: r.y + by, width: r.width - 2 * by, height: r.height - 2 * by });

export const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
};

/** Where the pod's parts sit, in CSS pixels from the window's top-left corner, flat (before the bend). */
export interface PodLayout {
  /** The whole window, bezel included. */
  frame: Rect;
  /** The glass, inside the bezel (its 1px rim included). */
  glass: Rect;
  /** Inside the glass's rim: the ceiling seen through it, the frost and the droplets. */
  inner: Rect;
  /** One ceiling tile's side, and where the tile grid's lines run through `inner` (a line at x0 + k·tile). */
  tile: number;
  tileX: number;
  tileY: number;
  /** The vent, set into a 3x3 block of tiles at the top right, partly behind the bezel. */
  vent: Rect;
  /** The vent's border width; the fan sits inside it, inset again. */
  ventBorder: number;
  fan: Rect;
  /** The stasis light on the bezel above the glass, and the glow around it. */
  stasis: Rect;
  stasisGlow: number;
  /** The maker's sticker, placed on the wall where the page's footer leaves room for it (desktop); null without one. */
  sticker: Rect | null;
  /** Wall seams: the horizontal grooves above and below the window, and the panel width between vertical ones. */
  seamTop: number;
  seamBottom: number;
  panel: number;
  /** The window light's reach past its edge: the darkness covers everything outside this ellipse. */
  vignette: { rx: number; ry: number };
}

/**
 * The layout the CSS version had. `rem` is the root font size; `mobile` is the phone layout
 * (MOBILE_QUERY), which has a thinner bezel.
 */
export function podLayout(width: number, height: number, rem: number, mobile: boolean, sticker: Rect | null = null): PodLayout {
  const frame = { x: 0, y: 0, width, height };
  const glass = inset(frame, (mobile ? 0.5 : 0.75) * rem);
  const inner = inset(glass, 1);
  const tile = 5 * rem;
  // The grid is anchored to the top-right corner: a tile's edge 4rem past the right side, 5rem above the top.
  const tileX = inner.x + inner.width + 4 * rem;
  const tileY = inner.y - 5 * rem;
  const ventSize = 3 * tile - 2;
  const vent = { x: tileX - ventSize, y: tileY + 2, width: ventSize, height: ventSize };
  const ventBorder = 0.5 * rem;
  const fan = inset(vent, ventBorder + 0.4 * rem);
  const stasisGlow = 0.6 * rem;
  const stasis = { x: width / 2 - 1.25 * rem, y: 0.2 * rem, width: 2.5 * rem, height: 0.25 * rem };
  return {
    frame,
    glass,
    inner,
    tile,
    tileX,
    tileY,
    vent,
    ventBorder,
    fan,
    stasis,
    stasisGlow,
    sticker,
    seamTop: -2.5 * rem,
    seamBottom: height + 5 * rem,
    panel: 13 * rem,
    vignette: { rx: width / 2 + 18 * rem, ry: height / 2 + 14 * rem },
  };
}

/**
 * The part of the flat drawing that can show: the wall's width, the vignette's height, and no more
 * than the screen's height (the bend only ever pulls points toward the centre vertically).
 * `top` and `bottom` are the screen's edges, from the window's top.
 */
export function flatBounds(layout: PodLayout, c: Cylinder, top: number, bottom: number): Rect {
  const cx = c.width / 2;
  const cy = c.height / 2;
  const half = c.width * (0.5 + WALL_SIDE);
  const x0 = Math.max(cx - half, cx - layout.vignette.rx);
  const x1 = Math.min(cx + half, cx + layout.vignette.rx);
  // The sticker sits by the screen's bottom edge, which can be past the vignette's reach.
  const y0 = Math.max(cy - layout.vignette.ry, top);
  const y1 = Math.min(Math.max(cy + layout.vignette.ry, layout.sticker ? layout.sticker.y + layout.sticker.height + 2 : 0), bottom);
  return { x: Math.floor(x0), y: Math.floor(y0), width: Math.ceil(x1 - x0), height: Math.ceil(Math.max(1, y1 - y0)) };
}

/** Device pixels per CSS pixel for the flat drawing: the screen's, at most 2, and within the GPU's texture limits. */
export function bakeScale(bounds: Rect, dpr: number, maxTexture: number, maxPixels = 8e6): number {
  let s = Math.min(Math.max(dpr, 1), 2);
  s = Math.min(s, maxTexture / bounds.width, maxTexture / bounds.height);
  s = Math.min(s, Math.sqrt(maxPixels / (bounds.width * bounds.height)));
  return s;
}

/** The stasis light's opacity at `ms`: a slow 3.2 s pulse between 0.35 and 1, steady at 0.8 with reduced motion. */
export function stasisAlpha(ms: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0.8;
  const t = (ms % 3200) / 3200;
  return 0.35 + 0.65 * (0.5 - 0.5 * Math.cos(2 * Math.PI * t));
}

/** The fan's angle at `ms`, in radians: a turn every 1.4 s, or 12 s with reduced motion. */
export function fanAngle(ms: number, reducedMotion: boolean): number {
  const period = reducedMotion ? 12_000 : 1_400;
  return ((ms % period) / period) * 2 * Math.PI;
}
