// One slice of the original's fx sheet (`FX_SHEET`), cut with a background offset and drawn at 1x. Decorative: whatever
// uses it names the thing in text.

import type { CSSProperties } from "react";
import { FX_SHEET } from "../art/assets.ts";

export function FxSprite({ slice, className }: { slice: readonly [number, number, number, number]; className?: string }) {
  const [x, y, w, h] = slice;
  const style: CSSProperties = { width: w, height: h, backgroundImage: `url(${FX_SHEET})`, backgroundPosition: `-${x}px -${y}px` };
  return <span className={className ? `fx-sprite ${className}` : "fx-sprite"} style={style} aria-hidden="true" />;
}
