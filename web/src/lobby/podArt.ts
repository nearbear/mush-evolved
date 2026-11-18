// The cryopod drawn flat, before the bend, with Canvas 2D: the lab ceiling seen through frosted glass,
// the metal bezel, and the brushed-metal wall around it with the maker's sticker. A port of what the
// CSS version drew with gradients, so the numbers here are that CSS's. Baked once per size; the Pixi
// backdrop (pixi/PodRenderer.ts) bends it onto the cylinder and animates the fan and stasis light on top.
//
// Two layers, because the fan spins between them: `under` is what's behind the fan (ceiling tiles and
// the vent's housing), `over` is everything in front of it (the vent's grille, the glass's tint, frost
// and droplets) plus everything outside the glass, which is opaque and so also hides the fan where the
// vent runs behind the bezel. The brightness ramp of the light from the left is left to the shader.
//
// Everything is drawn in CSS pixels from the window's top-left corner (podGeometry's PodLayout); the
// canvases cover `bounds` at `scale` device pixels per CSS pixel.

import { DARK, type PodLayout, podRadii, type Radius, type Rect, inset, union } from "./podGeometry.ts";

type Ctx = CanvasRenderingContext2D;
type Stops = [number, string][];

const FROST = "190 235 255";

// Fractal-noise ice for the frost: an SVG feTurbulence, thresholded into pale blotches, at four scales.
const noise = (size: number, frequency: string, octaves: number, seed: number, matrix: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='${octaves}' seed='${seed}'/><feColorMatrix values='${matrix}'/></filter><rect width='${size}' height='${size}' filter='url(#f)'/></svg>`,
  )}`;

/** The frost textures, bottom first, each with its tile size and offset from the glass's corner. */
const FROST_TILES = [
  { url: noise(128, ".11", 3, 2, "0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 2.4 0 0 0 -1.05"), size: 128, x: 40, y: 20 },
  { url: noise(256, ".03 .045", 5, 7, "0 0 0 0 .86 0 0 0 0 .95 0 0 0 0 1 3.2 0 0 0 -1.2"), size: 256, x: 0, y: 0 },
  { url: noise(300, ".02 .03", 4, 3, "0 0 0 0 .93 0 0 0 0 .98 0 0 0 0 1 6 0 0 0 -2.1"), size: 300, x: 90, y: 50 },
  { url: noise(200, ".4", 2, 11, "0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 5.5 0 0 0 -1.6"), size: 200, x: 0, y: 0 },
];

let frostImages: Promise<HTMLImageElement[]> | null = null;

/** The frost textures, decoded once for every bake. */
export function loadFrost(): Promise<HTMLImageElement[]> {
  frostImages ??= Promise.all(
    FROST_TILES.map(async ({ url }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    }),
  );
  return frostImages;
}

export interface PodArt {
  under: HTMLCanvasElement;
  over: HTMLCanvasElement;
  /** The fan, centred on its canvas, which is `fanPad` CSS pixels bigger than the fan on each side. */
  fan: HTMLCanvasElement;
  fanPad: number;
  /** The stasis light with its glow, covering `stasisRect`. */
  stasis: HTMLCanvasElement;
  stasisRect: Rect;
  /** The part of the drawing that changes each frame: the vent and the stasis light. */
  patch: Rect;
}

export interface BakeInput {
  layout: PodLayout;
  bounds: Rect;
  scale: number;
  rem: number;
  /** The viewport's height: the wall's shading spans it above and below the window, as the CSS did. */
  viewportHeight: number;
  frost: HTMLImageElement[];
}

export function bakePod(input: BakeInput): PodArt {
  const { layout, bounds, scale, rem } = input;
  const under = canvasFor(bounds, scale);
  drawUnder(under.ctx, input);
  const over = canvasFor(bounds, scale);
  drawInside(over.ctx, input);
  const outside = canvasFor(bounds, scale);
  drawOutside(outside.ctx, input);
  over.ctx.setTransform(1, 0, 0, 1, 0, 0);
  over.ctx.drawImage(outside.canvas, 0, 0);

  const fanPad = 2;
  const fanRect = inset(layout.fan, -fanPad);
  const fan = canvasFor(fanRect, scale);
  drawFan(fan.ctx, layout.fan, scale);

  const stasisRect = inset(layout.stasis, -rem);
  const stasis = canvasFor(stasisRect, scale);
  drawStasis(stasis.ctx, layout, rem);

  return { under: under.canvas, over: over.canvas, fan: fan.canvas, fanPad, stasis: stasis.canvas, stasisRect, patch: inset(union(layout.vent, stasisRect), -2) };
}

/** A canvas covering `r` (CSS pixels) at `scale`, its context set up to draw in CSS pixels. */
function canvasFor(r: Rect, scale: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(r.width * scale));
  canvas.height = Math.max(1, Math.ceil(r.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, -r.x * scale, -r.y * scale);
  return { canvas, ctx };
}

// ---- Shapes and CSS-like paint helpers ----

/** A box's outline: the pod's own shape, or a rounded rectangle with radius `radius`. */
type Corners = "pod" | number;

function shape(ctx: Ctx, r: Rect, corners: Corners) {
  const radii: number | Radius[] = corners === "pod" ? podRadii(r.width, r.height) : corners;
  ctx.roundRect(r.x, r.y, r.width, r.height, radii);
}

function fillShape(ctx: Ctx, r: Rect, corners: Corners, style: string | CanvasGradient | CanvasPattern) {
  ctx.beginPath();
  shape(ctx, r, corners);
  ctx.fillStyle = style;
  ctx.fill();
}

function gradientStops(g: CanvasGradient, stops: Stops): CanvasGradient {
  for (const [at, color] of stops) g.addColorStop(Math.min(1, Math.max(0, at)), color);
  return g;
}

/** A CSS linear-gradient(<deg>, ...) over box `r`: same angle convention and gradient line length. */
function linear(ctx: Ctx, r: Rect, deg: number, stops: Stops): CanvasGradient {
  const a = (deg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(r.width * dx) + Math.abs(r.height * dy)) / 2;
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  return gradientStops(ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half), stops);
}

/** A CSS radial-gradient(ellipse rx ry at cx cy, ...) filling `area`; past the last stop, its color carries on. */
function fillEllipse(ctx: Ctx, area: Rect, cx: number, cy: number, rx: number, ry: number, stops: Stops) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  ctx.fillStyle = gradientStops(ctx.createRadialGradient(0, 0, 0, 0, 0, 1), stops);
  ctx.fillRect((area.x - cx) / rx, (area.y - cy) / ry, area.width / rx, area.height / ry);
  ctx.restore();
}

interface Shadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

/** Far enough away that a shape drawn there to cast a shadow is never seen itself. */
const FAR = 20000;

/** Canvas shadows ignore the transform, so offsets and blur are given in device pixels. */
function castShadow(ctx: Ctx, s: Shadow) {
  const scale = ctx.getTransform().a;
  ctx.shadowColor = s.color;
  // A CSS blur radius is two standard deviations, as is a canvas shadowBlur.
  ctx.shadowBlur = s.blur * scale;
  ctx.shadowOffsetX = (s.x - FAR) * scale;
  ctx.shadowOffsetY = s.y * scale;
}

/** A CSS inset box-shadow, inside box `r`. */
function insetShadow(ctx: Ctx, r: Rect, corners: Corners, s: Shadow) {
  ctx.save();
  ctx.beginPath();
  shape(ctx, r, corners);
  ctx.clip();
  castShadow(ctx, s);
  const hole = inset(r, s.spread);
  const margin = s.blur * 2 + Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.spread) + 10;
  const outer = inset(r, -margin);
  ctx.beginPath();
  ctx.rect(outer.x + FAR, outer.y, outer.width, outer.height);
  shape(ctx, { ...hole, x: hole.x + FAR }, typeof corners === "number" ? Math.max(0, corners - s.spread) : corners);
  ctx.fillStyle = "#000";
  ctx.fill("evenodd");
  ctx.restore();
}

/** A CSS (outer) box-shadow of box `r`. Also shades under the box, which whatever fills it then covers. */
function outerShadow(ctx: Ctx, r: Rect, corners: Corners, s: Shadow) {
  ctx.save();
  castShadow(ctx, s);
  const grown = inset(r, -s.spread);
  ctx.beginPath();
  shape(ctx, { ...grown, x: grown.x + FAR }, typeof corners === "number" ? corners + s.spread : corners);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.restore();
}

/** Draws `draw` blurred by `px` CSS pixels (the CSS `filter: blur()` on the ceiling). */
function blurred(ctx: Ctx, px: number, draw: () => void) {
  const prev = ctx.filter;
  ctx.filter = `blur(${px * ctx.getTransform().a}px)`;
  draw();
  ctx.filter = prev;
}

// ---- Behind the fan ----

/** The lab ceiling: square tiles on a dark T-bar grid, and the vent's housing set into it. */
function drawUnder(ctx: Ctx, { layout, bounds, rem }: BakeInput) {
  ctx.fillStyle = DARK;
  ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  const { inner, tile, tileX, tileY, vent, ventBorder } = layout;
  ctx.save();
  ctx.beginPath();
  shape(ctx, inner, "pod");
  ctx.clip();
  blurred(ctx, 1, () => {
    ctx.fillStyle = "#9ba5ab";
    ctx.fillRect(inner.x - 4, inner.y - 4, inner.width + 8, inner.height + 8);
    ctx.fillStyle = "#4a5156";
    const firstX = tileX - Math.ceil((tileX - inner.x) / tile) * tile;
    for (let x = firstX; x < inner.x + inner.width; x += tile) ctx.fillRect(x, inner.y - 4, 2, inner.height + 8);
    const firstY = tileY - Math.ceil((tileY - inner.y) / tile) * tile;
    for (let y = firstY; y < inner.y + inner.height; y += tile) ctx.fillRect(inner.x - 4, y, inner.width + 8, 2);
    fillShape(ctx, vent, 0.3 * rem, "#a3abb0");
    ctx.fillStyle = "#3a4247";
    const hole = inset(vent, ventBorder);
    ctx.fillRect(hole.x, hole.y, hole.width, hole.height);
  });
  insetShadow(ctx, inset(vent, ventBorder), 0, { x: 0, y: 0, blur: rem, spread: 0, color: "rgb(0 0 0 / 0.5)" });
  ctx.restore();
}

/** The fan: six blades round a hub, slightly blurred like the rest of the ceiling. Spins in the renderer. */
function drawFan(ctx: Ctx, fan: Rect, scale: number) {
  const cx = fan.x + fan.width / 2;
  const cy = fan.y + fan.height / 2;
  const radius = fan.width / 2;
  const sharp = canvasFor(inset(fan, -2), scale);
  const c = sharp.ctx;
  c.beginPath();
  c.arc(cx, cy, radius, 0, 2 * Math.PI);
  c.clip();
  c.fillStyle = "#3a4247";
  c.fillRect(fan.x, fan.y, fan.width, fan.height);
  c.fillStyle = "#7d878d";
  for (let k = 0; k < 6; k++) {
    // CSS conic angles start at the top; canvas angles at the right.
    const from = ((60 * k - 90) * Math.PI) / 180;
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, radius + 1, from, from + (28 * Math.PI) / 180);
    c.closePath();
    c.fill();
  }
  // The hub's stops are a share of the distance to the box's corner, as in CSS.
  const corner = radius * Math.SQRT2;
  c.fillStyle = gradientStops(c.createRadialGradient(cx, cy, 0, cx, cy, corner), [
    [0.12, "#aab2b6"],
    [0.13, "#5f686d"],
    [0.15, "#5f686d"],
    [0.16, "rgb(95 104 109 / 0)"],
  ]);
  c.fillRect(fan.x, fan.y, fan.width, fan.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = `blur(${scale}px)`;
  ctx.drawImage(sharp.canvas, 0, 0);
  ctx.filter = "none";
}

// ---- In front of the fan, inside the glass ----

function drawInside(ctx: Ctx, input: BakeInput) {
  const { layout, rem } = input;
  const { inner, vent, ventBorder } = layout;
  ctx.save();
  ctx.beginPath();
  shape(ctx, inner, "pod");
  ctx.clip();

  // The vent's grille: slats every 1.1rem, counted up from the bottom.
  const grille = inset(vent, ventBorder);
  ctx.save();
  ctx.beginPath();
  ctx.rect(grille.x, grille.y, grille.width, grille.height);
  ctx.clip();
  blurred(ctx, 1, () => {
    for (let bottom = grille.y + grille.height; bottom > grille.y; bottom -= 1.1 * rem) {
      ctx.fillStyle = "#b4bbbf";
      ctx.fillRect(grille.x, bottom - 0.25 * rem, grille.width, 0.25 * rem);
      ctx.fillStyle = "#5a6268";
      ctx.fillRect(grille.x, bottom - 0.35 * rem, grille.width, 0.1 * rem);
    }
  });
  insetShadow(ctx, grille, 0, { x: 0, y: 0, blur: 0.75 * rem, spread: 0, color: "rgb(0 0 0 / 0.5)" });
  ctx.restore();

  drawGlassTint(ctx, inner, rem);
  drawFrost(ctx, input);
  drawDroplets(ctx, inner, rem);
  ctx.restore();
}

/**
 * The glass itself, over the ceiling and vent alike: a cold tint, long vertical reflections along the
 * near left and right edges (the glass curves away in the middle), and shadow just inside the rim.
 */
function drawGlassTint(ctx: Ctx, r: Rect, rem: number) {
  const white = (a: number) => `rgb(255 255 255 / ${a})`;
  const clear = white(0);
  ctx.fillStyle = "rgb(140 190 220 / 0.14)";
  ctx.fillRect(r.x, r.y, r.width, r.height);
  const layers: [number, Stops][] = [
    [180, [[0.5, "rgb(10 30 45 / 0)"], [1, "rgb(10 30 45 / 0.3)"]]],
  ];
  for (const [deg, stops] of layers) {
    ctx.fillStyle = linear(ctx, r, deg, stops);
    ctx.fillRect(r.x, r.y, r.width, r.height);
  }
  fillEllipse(ctx, r, r.x + r.width / 2, r.y + r.height / 2, 0.3 * r.width, 0.7 * r.height, [[0, "rgb(2 6 10 / 0.12)"], [1, "rgb(2 6 10 / 0)"]]);
  const streaks: [number, Stops][] = [
    [270, [[0.13, clear], [0.14, white(0.08)], [0.155, clear]]],
    [270, [[0.04, clear], [0.09, white(0.12)], [0.15, clear]]],
    [90, [[0.15, clear], [0.165, white(0.16)], [0.185, clear]]],
    [90, [[0.03, clear], [0.08, white(0.2)], [0.13, white(0.06)], [0.19, clear]]],
  ];
  for (const [deg, stops] of streaks) {
    ctx.fillStyle = linear(ctx, r, deg, stops);
    ctx.fillRect(r.x, r.y, r.width, r.height);
  }
  const shade = (a: number) => `rgb(2 6 10 / ${a})`;
  insetShadow(ctx, r, "pod", { x: 0, y: 0, blur: 4 * rem, spread: 0, color: shade(0.3) });
  insetShadow(ctx, r, "pod", { x: 0, y: 0, blur: rem, spread: 0, color: shade(0.55) });
  insetShadow(ctx, r, "pod", { x: 0, y: -2.5 * rem, blur: 3 * rem, spread: -rem, color: shade(0.55) });
  insetShadow(ctx, r, "pod", { x: 0, y: 2, blur: 1, spread: 0, color: white(0.4) });
}

/**
 * Frost on the inside of the glass, thickest at the rim and thinning toward the centre: patchy ice
 * at two scales over a smooth haze and a bright inner edge, faded out in the middle so the panel's
 * text keeps its contrast.
 */
function drawFrost(ctx: Ctx, { layout, bounds, scale, rem, frost }: BakeInput) {
  const r = layout.inner;
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const layer = canvasFor(bounds, scale);
  const c = layer.ctx;
  c.beginPath();
  shape(c, r, "pod");
  c.clip();
  const ice = (i: number) => {
    const tile = FROST_TILES[i]!;
    const pattern = c.createPattern(frost[i]!, "repeat")!;
    pattern.setTransform(new DOMMatrix().translate(r.x + tile.x, r.y + tile.y));
    c.fillStyle = pattern;
    c.fillRect(r.x, r.y, r.width, r.height);
  };
  const frostColor = (a: number) => `rgb(${FROST} / ${a})`;
  fillEllipse(c, r, cx, cy, 0.72 * r.width, 0.72 * r.height, [[0.6, frostColor(0)], [0.82, frostColor(0.2)], [1, frostColor(0.45)]]);
  ice(0);
  ice(1);
  fillEllipse(c, r, cx, cy, 0.74 * r.width, 0.74 * r.height, [
    [0.58, "rgb(235 248 255 / 0)"],
    [0.72, "rgb(235 248 255 / 0.1)"],
    [0.88, "rgb(235 248 255 / 0.4)"],
    [1, "rgb(245 252 255 / 0.9)"],
  ]);
  ice(2);
  ice(3);
  insetShadow(c, r, "pod", { x: 0, y: 0, blur: 0.4 * rem, spread: 0, color: "rgb(255 255 255 / 0.6)" });
  insetShadow(c, r, "pod", { x: 0, y: 0, blur: 1.5 * rem, spread: 0.25 * rem, color: "rgb(200 240 255 / 0.55)" });
  c.globalCompositeOperation = "destination-in";
  fillEllipse(c, r, cx, cy, 0.74 * r.width, 0.74 * r.height, [
    [0.4, "rgb(0 0 0 / 0)"],
    [0.58, "rgb(0 0 0 / 0.15)"],
    [0.74, "rgb(0 0 0 / 0.55)"],
    [0.92, "#000"],
  ]);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer.canvas, 0, 0);
  ctx.restore();
}

/** Droplets: a bright upper-left glint and a dark lower-right edge each, so they read as lenses. */
const DROPLETS: [number, number, number][] = [
  [0.14, 0.74, 0.5],
  [0.19, 0.8, 0.3],
  [0.83, 0.7, 0.4],
  [0.88, 0.77, 0.65],
  [0.7, 0.9, 0.35],
  [0.32, 0.93, 0.45],
  [0.09, 0.38, 0.3],
  [0.93, 0.33, 0.35],
];

function drawDroplets(ctx: Ctx, r: Rect, rem: number) {
  for (const [px, py, size] of DROPLETS) {
    const s = size * rem;
    const x = r.x + (r.width - s) * px;
    const y = r.y + (r.height - s) * py;
    const cx = x + 0.35 * s;
    const cy = y + 0.3 * s;
    ctx.fillStyle = gradientStops(ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(0.65 * s, 0.7 * s)), [
      [0, "rgb(255 255 255 / 0.75)"],
      [0.12, "rgb(255 255 255 / 0.75)"],
      [0.4, `rgb(${FROST} / 0.22)`],
      [0.9, "rgb(2 6 10 / 0.3)"],
      [1, "rgb(2 6 10 / 0)"],
    ]);
    ctx.fillRect(x, y, s, s);
  }
}

// ---- Outside the glass ----

/** The wall, the window's light on it, the bezel and the glass's rim, with the glass's inside cut out. */
function drawOutside(ctx: Ctx, input: BakeInput) {
  const { layout, rem } = input;
  drawWall(ctx, input);
  if (layout.sticker) drawSticker(ctx, layout.sticker, rem);

  // Window light spilling onto the wall around it.
  const { frame, glass, inner } = layout;
  outerShadow(ctx, frame, "pod", { x: 0, y: 0, blur: 10 * rem, spread: 3 * rem, color: "rgb(150 205 240 / 0.08)" });
  outerShadow(ctx, frame, "pod", { x: 0, y: 0, blur: 3 * rem, spread: 0.5 * rem, color: "rgb(170 215 245 / 0.16)" });

  // The bezel: a conic gradient of light and dark greys, the anisotropic sheen of polished metal.
  const conic = ctx.createConicGradient(((200 - 90) * Math.PI) / 180, frame.width / 2, frame.height / 2);
  gradientStops(conic, [
    [0, "#46596a"],
    [0.1, "#b4d0e2"],
    [0.22, "#374a5a"],
    [0.35, "#7894a8"],
    [0.5, "#2c3d4b"],
    [0.62, "#9fbcd0"],
    [0.75, "#384b5b"],
    [0.88, "#839fb3"],
    [1, "#46596a"],
  ]);
  fillShape(ctx, frame, "pod", conic);
  insetShadow(ctx, frame, "pod", { x: 0, y: -2, blur: 3, spread: 0, color: "rgb(0 0 0 / 0.5)" });
  insetShadow(ctx, frame, "pod", { x: 0, y: 1, blur: 1, spread: 0, color: "rgb(255 255 255 / 0.35)" });

  // The glass, recessed into the bezel, with a thin cold line round it.
  fillShape(ctx, inset(glass, -2), "pod", "#0b0f12");
  fillShape(ctx, glass, "pod", linear(ctx, glass, 160, [[0, "rgb(120 200 230 / 0.09)"], [0.4, "rgb(10 25 35 / 0.55)"], [1, "rgb(120 200 230 / 0.05)"]]));
  fillShape(ctx, glass, "pod", `rgb(${FROST} / 0.35)`);
  ctx.globalCompositeOperation = "destination-out";
  fillShape(ctx, inner, "pod", "#000");
  ctx.globalCompositeOperation = "source-over";
}

/**
 * The pod's inside wall: brushed metal (fine horizontal streaks over a dark base) in panels with
 * seams and rivets, lit by the window and black further out. Its shading spans the viewport above
 * and below the window, as the CSS did.
 */
function drawWall(ctx: Ctx, { layout, bounds, rem, viewportHeight }: BakeInput) {
  const { frame, seamTop, seamBottom, panel, vignette } = layout;
  const top = -viewportHeight / 2;
  const bottom = frame.height + viewportHeight / 2;
  const face = { x: bounds.x, y: top, width: bounds.width, height: bottom - top };
  const x0 = bounds.x;
  const x1 = bounds.x + bounds.width;
  const y0 = bounds.y;
  const y1 = bounds.y + bounds.height;
  ctx.fillStyle = linear(ctx, face, 180, [[0, "#2c4457"], [0.5, "#1a2a37"], [1, "#2c4457"]]);
  ctx.fillRect(x0, y0, bounds.width, bounds.height);
  // Streaks, counted up from the face's bottom like the CSS repeating gradients.
  const rows = (period: number, color: string) => {
    ctx.fillStyle = color;
    const first = bottom - Math.ceil((bottom - y1) / period) * period;
    for (let y = first; y > y0 - period; y -= period) ctx.fillRect(x0, y - 1, bounds.width, 1);
  };
  rows(5, "rgb(0 0 0 / 0.12)");
  rows(3, "rgb(200 230 255 / 0.05)");
  // Vertical seams between panels of a fixed width, centred on the window: a groove, then a lit lip.
  const seamX = frame.width / 2 - panel / 2;
  const firstSeam = seamX - 2 - Math.ceil((seamX - 2 - x0) / panel) * panel;
  for (let x = firstSeam; x < x1; x += panel) {
    ctx.fillStyle = "#070c11";
    ctx.fillRect(x, y0, 3, bounds.height);
    ctx.fillStyle = "rgb(200 228 250 / 0.22)";
    ctx.fillRect(x + 3, y0, 1, bounds.height);
  }
  // Horizontal seams above and below the window: a dark groove with a lit lower lip.
  for (const y of [seamTop, seamBottom]) {
    ctx.fillStyle = "#070c11";
    ctx.fillRect(x0, y, bounds.width, 3);
    ctx.fillStyle = "rgb(200 228 250 / 0.3)";
    ctx.fillRect(x0, y + 3, bounds.width, 1);
  }
  // Rivets along the horizontal seams, four per panel, each in the middle of a quarter panel.
  const step = panel / 4;
  const firstRivet = seamX + step / 2 - Math.ceil((seamX + step / 2 - x0) / step) * step;
  for (const y of [seamTop - 0.9 * rem + 4, seamBottom + 0.9 * rem]) {
    for (let x = firstRivet; x < x1 + step; x += step) {
      ctx.fillStyle = gradientStops(ctx.createRadialGradient(x, y, 0, x, y, 3.5), [
        [0, "#b7c9d6"],
        [1.5 / 3.5, "#b7c9d6"],
        [2 / 3.5, "#3a4c5a"],
        [3 / 3.5, "#070c11"],
        [1, "rgb(7 12 17 / 0)"],
      ]);
      ctx.fillRect(x - 4, y - 4, 8, 8);
    }
  }
  fillEllipse(ctx, bounds, frame.width / 2, frame.height / 2, vignette.rx, vignette.ry, [
    [0.55, "rgb(2 6 12 / 0)"],
    [0.8, "rgb(2 6 12 / 0.7)"],
    [1, DARK],
  ]);
}

/** The manufacturer's sticker: faded paper, a printed border, a barcode. Lit by the window like the wall. */
function drawSticker(ctx: Ctx, r: Rect, rem: number) {
  ctx.save();
  ctx.globalAlpha = 0.85;
  const radius = 0.2 * rem;
  outerShadow(ctx, { ...r, y: r.y + 1 }, radius, { x: 0, y: 0, blur: 2, spread: 0, color: "rgb(0 0 0 / 0.6)" });
  fillShape(ctx, r, radius, linear(ctx, r, 170, [[0, "#e8e2cc"], [1, "#cfc7ab"]]));
  const border = inset(r, 0.2 * rem - 0.5);
  ctx.strokeStyle = "rgb(42 38 32 / 0.6)";
  ctx.lineWidth = 1;
  ctx.strokeRect(border.x, border.y, border.width, border.height);

  const ink = "#2a2620";
  const cx = r.x + r.width / 2;
  let y = r.y + 0.35 * rem;
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const line = (text: string, font: string, size: number, spacing: number) => {
    ctx.font = `${font} ${size}px "Kanit", system-ui, sans-serif`;
    ctx.letterSpacing = `${spacing * size}px`;
    // Centred like the CSS, which keeps the trailing letter space.
    ctx.fillText(text, cx + (spacing * size) / 2, y + 0.05 * size);
    y += 1.1 * size + 0.15 * rem;
  };
  line("ChangMei-Tech", "800", 0.8 * rem, 0.15); // i18n-ignore: placeholder sticker copy
  line("Placeholder slogan goes here", "italic", 0.5 * rem, 0); // i18n-ignore: placeholder sticker copy
  // The barcode: bars of 1, 2 and 1px in every 10px.
  y += 0.1 * rem;
  const barWidth = 0.7 * r.width;
  const barHeight = 0.55 * rem;
  const bx = cx - barWidth / 2;
  for (let x = 0; x < barWidth; x += 10) {
    for (const [from, to] of [[0, 1], [3, 5], [6, 7]] as const) {
      const w = Math.min(to, barWidth - x) - from;
      if (w > 0) ctx.fillRect(bx + x + from, y, w, barHeight);
    }
  }
  y += barHeight + 0.15 * rem;
  line("MODEL CP-00 · S/N 000-0000", "", 0.4 * rem, 0.1); // i18n-ignore: placeholder sticker copy
  ctx.restore();
}

// ---- The stasis light ----

/** A small light on the bezel above the glass; the renderer pulses its opacity like a heartbeat monitor. */
function drawStasis(ctx: Ctx, layout: PodLayout, rem: number) {
  const r = layout.stasis;
  const radius = 0.25 * rem;
  outerShadow(ctx, r, radius, { x: 0, y: 0, blur: 0.5 * rem, spread: 0.1 * rem, color: "rgb(80 210 245 / 0.8)" });
  fillShape(ctx, r, radius, "rgb(110 240 255)");
}
