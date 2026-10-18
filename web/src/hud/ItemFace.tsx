import type { ReactNode } from "react";

/**
 * An item's square face: the icon filling it, the name along the bottom. Everything is sized in em
 * off `--tile` (default 76px), so a caller resizes the whole face by setting that one variable.
 */
export function ItemFace({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="item-face">
      {children}
      <span className="item-label">{label}</span>
    </span>
  );
}
