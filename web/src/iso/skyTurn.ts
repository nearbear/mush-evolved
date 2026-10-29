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
