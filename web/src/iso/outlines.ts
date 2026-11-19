// Outlines for sprites that are more than their equipment. Some slices are a whole slab of the room with the
// equipment in it (the engine room's plasma shield carries a wall with consoles and a strip of floor trim around
// its pit). Hover, selection and the broken glow would light up the slab, straight cut edges and all, so such a
// slice gets an outline: only its pixels inside it take clicks and get the effect. Pure (no DOM, no Pixi).

/** A point in the slice's own pixels, unmirrored, from its top-left corner. */
export type OutlinePoint = readonly [x: number, y: number];

/**
 * Outlines by the tile's slice (not its `looks` swap: a look is the same size and layout, so the outline fits both).
 * Traced by hand over the art: the plasma shield's tower, coils, pit and stairs, without the console wall on its
 * left or the floor trim outside its railing.
 */
export const SLICE_OUTLINES: Readonly<Record<string, readonly OutlinePoint[]>> = {
  plasma_shield: [
    [95, 19], [128, 19], [128, 62], [163, 62], [163, 78], [194, 78], [194, 100], [207, 122], [213, 124],
    [213, 150], [186, 160], [173, 150], [90, 107], [95, 100],
  ],
};

/** Whether the pixel at (x, y) (its centre) is inside the outline (even-odd rule). */
export function insideOutline(outline: readonly OutlinePoint[], x: number, y: number): boolean {
  const px = x + 0.5, py = y + 0.5;
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i]!, [xj, yj] = outline[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
