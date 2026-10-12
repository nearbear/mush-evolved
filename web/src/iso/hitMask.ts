// Per-pixel opacity of sprite frames, for clicking what is actually drawn
// rather than a sprite's bounding box. Each frame's alpha is read once from
// its image through a canvas the size of the frame (some atlases are too big
// to read whole) and cached.

/** Pixels fainter than this (out of 255) don't count: soft shadows and glows stay click-through. */
const ALPHA_MIN = 64;

const images = new Map<string, HTMLImageElement>();
const masks = new Map<string, Uint8Array>();

/** Starts loading an image so its masks are ready by the first click. */
export function preloadImage(url: string): HTMLImageElement {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    images.set(url, img);
  }
  return img;
}

/**
 * Whether pixel (x, y) of the frame at (sx, sy, width, height) in `url` is
 * opaque. `keyed` treats the frame's top-left color as transparent, matching
 * keyedSprite.ts for the crew strips (whose first frame starts at 0,0).
 * Until the image has loaded, every pixel counts as opaque (the old box behavior).
 */
export function opaqueAt(
  url: string,
  frame: { sx: number; sy: number; width: number; height: number },
  x: number,
  y: number,
  keyed = false,
): boolean {
  const key = `${url}|${frame.sx},${frame.sy},${frame.width},${frame.height}|${keyed}`;
  let mask = masks.get(key);
  if (!mask) {
    const img = preloadImage(url);
    if (!img.complete || img.naturalWidth === 0) return true;
    mask = readMask(img, frame, keyed);
    masks.set(key, mask);
  }
  return mask[y * frame.width + x] === 1;
}

function readMask(
  img: HTMLImageElement,
  { sx, sy, width, height }: { sx: number; sy: number; width: number; height: number },
  keyed: boolean,
): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, sx, sy, width, height, 0, 0, width, height);
  const px = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    const isKey = keyed && px[p] === px[0] && px[p + 1] === px[1] && px[p + 2] === px[2];
    mask[i] = !isKey && px[p + 3]! >= ALPHA_MIN ? 1 : 0;
  }
  return mask;
}
