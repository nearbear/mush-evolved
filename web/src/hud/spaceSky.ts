// The star field behind the patrol cockpit's space scene (PatrolCockpit.tsx): the same procedural sky the iso view
// draws (iso/starfield.ts), as two tiling images for CSS backgrounds, the sky and the nearer stars over it. Made once,
// the first time a cockpit shows. Null where there is no 2D canvas (tests).

import { ftlStarLayer, ftlStarfield, starLayer, starfield, type StarfieldImage } from "../iso/starfield.ts";

/** The tile's side in pixels; space.css scrolls by multiples of it, so the loop is seamless. */
const SIZE = 512;

function toUrl({ size, rgba }: StarfieldImage, transparent: boolean): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext("2d");
  } catch {
    return null;
  }
  if (!context) return null;
  // The star layer's ground is all zeroes: only the pixels it drew are opaque.
  if (!transparent) for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  context.putImageData(new ImageData(rgba, size, size), 0, 0);
  return canvas.toDataURL("image/png");
}

let made: { sky: string; stars: string } | null | undefined;
let madeFtl: { sky: string; stars: string } | null | undefined;

export function spaceSky(): { sky: string; stars: string } | null {
  if (made === undefined) {
    const sky = toUrl(starfield(SIZE), false);
    const stars = sky && toUrl(starLayer(SIZE), true);
    made = sky && stars ? { sky, stars } : null;
  }
  return made;
}

/** Faster-than-light streaked sky tiles for CSS backgrounds (#480), made lazily once the ship launches. */
export function ftlSpaceSky(): { sky: string; stars: string } | null {
  if (madeFtl === undefined) {
    const sky = toUrl(ftlStarfield(SIZE), false);
    const stars = sky && toUrl(ftlStarLayer(SIZE), true);
    madeFtl = sky && stars ? { sky, stars } : null;
  }
  return madeFtl;
}
